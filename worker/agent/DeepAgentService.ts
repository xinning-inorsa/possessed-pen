import { Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { HITLResponse } from 'langchain'
import type {
	AgentStreamEvent,
	AgentStreamRequest,
} from '../../shared/types/AgentStreamProtocol'
import type { Environment } from '../environment'
import { buildCanvasFiles } from './buildCanvasFiles'
import { extractHitlInterrupts } from './canvasTools'
import type { PenDeepAgent } from './createPenDeepAgent'
import { setPendingHitlToolCount } from './pendingHitlToolCount'
import { setPendingToolResults } from './pendingToolResults'

function getInterruptPayload(result: unknown): unknown | null {
	if (!result || typeof result !== 'object') return null
	const record = result as Record<string, unknown>
	const interrupts = record.__interrupt__
	if (!Array.isArray(interrupts) || interrupts.length === 0) return null
	const first = interrupts[0] as { value?: unknown } | unknown
	if (first && typeof first === 'object' && 'value' in first) {
		return (first as { value: unknown }).value
	}
	return first
}

export class DeepAgentService {
	private agentPromise: Promise<PenDeepAgent> | null = null
	private env: Environment

	constructor(env: Environment) {
		this.env = env
	}

	private async getAgent(): Promise<PenDeepAgent> {
		if (!this.agentPromise) {
			this.agentPromise = (async () => {
				const [{ MemorySaver }, { createPenDeepAgent }] = await Promise.all([
					import('@langchain/langgraph-checkpoint'),
					import('./createPenDeepAgent'),
				])
				return createPenDeepAgent(this.env, new MemorySaver())
			})()
		}
		return this.agentPromise
	}

	async run(request: AgentStreamRequest): Promise<AgentStreamEvent> {
		const config = { configurable: { thread_id: request.threadId } }

		try {
			const agent = await this.getAgent()

		if (request.type === 'start') {
			const files = buildCanvasFiles(request.canvas)
			// Screenshot goes in the FIRST message only — LangGraph replays full history on
			// every model call, so a persistent image would be re-uploaded on every step.
			const message = new HumanMessage({
				content: [
					...(request.canvas.screenshotDataUrl
						? ([
								{
									type: 'image_url',
									image_url: { url: request.canvas.screenshotDataUrl },
								},
								{
									type: 'text',
									text: 'Screenshot of the user viewport (visual reference; coordinates in /canvas/shapes.json are authoritative).',
								},
							] as const)
						: []),
					{ type: 'text', text: request.message },
				] as unknown as HumanMessage['content'],
			})
			const result = await agent.invoke(
				{
					messages: [message],
					files,
				},
				config
			)
			return this.mapResult(request.threadId, result)
		}

			setPendingToolResults(request.threadId, request.resume)
			const hitlResume: HITLResponse = {
				decisions: request.resume.map(() => ({ type: 'approve' as const })),
			}
			const result = await agent.invoke(new Command({ resume: hitlResume }), config)
			return this.mapResult(request.threadId, result)
		} catch (error: unknown) {
			console.error('DeepAgentService error:', error)
			const message =
				error instanceof Error
					? error.message
					: typeof error === 'object' &&
						  error !== null &&
						  'message' in error &&
						  typeof (error as { message: unknown }).message === 'string'
						? (error as { message: string }).message
						: 'Agent run failed'
			return { type: 'error', message }
		}
	}

	private mapResult(threadId: string, result: unknown): AgentStreamEvent {
		const interruptValue = getInterruptPayload(result)
		if (interruptValue != null) {
			const tools = extractHitlInterrupts(interruptValue)
			if (tools.length > 0) {
				setPendingHitlToolCount(threadId, tools.length)
				return {
					type: 'interrupt',
					threadId,
					tools,
				}
			}
		}
		return { type: 'done', threadId }
	}
}
