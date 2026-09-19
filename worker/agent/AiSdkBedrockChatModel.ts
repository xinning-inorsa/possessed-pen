import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import {
	BaseChatModel,
	type BaseChatModelCallOptions,
	type BindToolsInput,
} from '@langchain/core/language_models/chat_models'
import type { ChatResult } from '@langchain/core/outputs'
import { isStructuredTool, type StructuredToolInterface } from '@langchain/core/tools'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import { dynamicTool, generateText, stepCountIs } from 'ai'
import type { z } from 'zod'
import { getBedrockLanguageModel } from '../bedrock'
import type { Environment } from '../environment'

type AiSdkCallOptions = BaseChatModelCallOptions & {
	tools?: BindToolsInput[]
}

type ToolCallLike = { id: string; name: string; args: Record<string, unknown> }

function isStructuredToolLike(tool: BindToolsInput): tool is StructuredToolInterface {
	return isStructuredTool(tool)
}

function toAiSdkTools(tools: BindToolsInput[] = []): ToolSet {
	const out: ToolSet = {}
	for (const entry of tools) {
		if (!isStructuredToolLike(entry)) continue
		out[entry.name] = dynamicTool({
			description: entry.description,
			inputSchema: entry.schema as z.ZodObject<z.ZodRawShape>,
		})
	}
	return out
}

function extractAssistantText(ai: AIMessage): string {
	if (typeof ai.content === 'string') return ai.content
	if (!Array.isArray(ai.content)) return ''
	return ai.content
		.filter((block): block is { type: 'text'; text: string } => {
			return (
				typeof block === 'object' &&
				block !== null &&
				'type' in block &&
				block.type === 'text' &&
				'text' in block &&
				typeof block.text === 'string'
			)
		})
		.map((block) => block.text)
		.join('')
}

function extractToolCalls(ai: AIMessage): ToolCallLike[] {
	const fromField =
		ai.tool_calls
			?.filter((tc): tc is ToolCallLike => typeof tc.id === 'string' && typeof tc.name === 'string')
			.map((tc) => ({
				id: tc.id,
				name: tc.name,
				args: (tc.args as Record<string, unknown>) ?? {},
			})) ?? []

	if (fromField.length > 0) return fromField

	const fromBlocks =
		ai.contentBlocks
			?.filter(
				(
					block
				): block is {
					type: 'tool_call'
					id: string
					name: string
					args: Record<string, unknown>
				} =>
					block.type === 'tool_call' &&
					typeof block.id === 'string' &&
					typeof block.name === 'string'
			)
			.map((block) => ({
				id: block.id,
				name: block.name,
				args: block.args ?? {},
			})) ?? []

	return fromBlocks
}

function toModelMessages(messages: BaseMessage[]): ModelMessage[] {
	const out: ModelMessage[] = []
	// Screenshot is sent once — on the first model call. LangGraph replays full history
	// on every step, so images in older messages are stripped to avoid re-uploading.
	let imageSent = false
	for (const message of messages) {
		const type = message.getType()
		if (type === 'system') {
			out.push({ role: 'system', content: String(message.content) })
			continue
		}
	if (type === 'human') {
		const content = message.content
		if (typeof content === 'string') {
			out.push({ role: 'user', content })
			continue
		}
		if (Array.isArray(content)) {
			type Part =
				| { type: 'text'; text: string }
				| { type: 'file'; data: string; mediaType: string }
			const parts: Part[] = []
			for (const raw of content) {
				if (typeof raw !== 'object' || raw === null) continue
				const block = raw as Record<string, unknown>
				if (block.type === 'text' && typeof block.text === 'string') {
					parts.push({ type: 'text', text: block.text })
					continue
				}
				if (block.type === 'image_url') {
					if (imageSent) continue
					const imageUrl = block.image_url as { url?: unknown } | undefined
					if (typeof imageUrl?.url !== 'string') continue
					const url = imageUrl.url
					const base64 = url.startsWith('data:') ? url.slice(url.indexOf(',') + 1) : url
					parts.push({ type: 'file', data: base64, mediaType: 'image/png' })
					imageSent = true
				}
			}
			out.push({ role: 'user', content: parts })
			continue
		}
		out.push({ role: 'user', content: String(content) })
		continue
	}
		if (type === 'ai') {
			const ai = message as AIMessage
			const toolCalls = extractToolCalls(ai)
			const text = extractAssistantText(ai)
			if (toolCalls.length > 0) {
				out.push({
					role: 'assistant',
					content: [
						...(text.trim()
							? [{ type: 'text' as const, text }]
							: []),
						...toolCalls.map((tc) => ({
							type: 'tool-call' as const,
							toolCallId: tc.id,
							toolName: tc.name,
							input: tc.args,
						})),
					],
				})
			} else {
				out.push({ role: 'assistant', content: text })
			}
			continue
		}
		if (type === 'tool') {
			const tool = message as ToolMessage
			out.push({
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						toolCallId: tool.tool_call_id,
						toolName: tool.name ?? 'tool',
						output: { type: 'text', value: String(tool.content) },
					},
				],
			})
		}
	}
	return out
}

/** LangChain chat model backed by the Workers-safe AI SDK Bedrock Anthropic client. */
export class AiSdkBedrockChatModel extends BaseChatModel<AiSdkCallOptions> {
	static override lc_name() {
		return 'AiSdkBedrockChatModel'
	}

	override lc_namespace = ['possessed_pen', 'chat_models', 'bedrock']

	private model: LanguageModel

	constructor(env: Environment) {
		super({})
		this.model = getBedrockLanguageModel(env)
	}

	override _llmType() {
		return 'ai-sdk-bedrock'
	}

	override bindTools(tools: BindToolsInput[], kwargs?: Partial<AiSdkCallOptions>) {
		return this.withConfig({ ...kwargs, tools })
	}

	override async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		_runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		const callOptions = options as AiSdkCallOptions
		const aiTools = toAiSdkTools(callOptions.tools)
		const modelMessages = toModelMessages(messages)

		const systemParts = messages.filter((m) => m.getType() === 'system')
		const instructions =
			systemParts.length > 0
				? systemParts.map((m) => String(m.content)).join('\n\n')
				: undefined

		const nonSystemMessages = modelMessages.filter((m) => m.role !== 'system')

		const result = await generateText({
			model: this.model,
			messages: nonSystemMessages,
			...(instructions ? { instructions } : {}),
			...(Object.keys(aiTools).length ? { tools: aiTools, stopWhen: stepCountIs(1) } : {}),
			temperature: 0,
		})

		const tool_calls = result.toolCalls?.map((tc) => ({
			id: tc.toolCallId,
			name: tc.toolName,
			args: tc.input as Record<string, unknown>,
			type: 'tool_call' as const,
		}))

		const aiMessage = new AIMessage({
			content: result.text ?? '',
			tool_calls,
			response_metadata: { model_provider: 'anthropic' },
		})

		return {
			generations: [{ text: result.text ?? '', message: aiMessage }],
		}
	}
}

export function createBedrockChatModel(env: Environment) {
	return new AiSdkBedrockChatModel(env)
}
