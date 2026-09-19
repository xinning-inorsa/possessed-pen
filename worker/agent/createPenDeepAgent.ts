import { MemorySaver } from '@langchain/langgraph-checkpoint'
import { createDeepAgent, StateBackend } from 'deepagents'
import type { Environment } from '../environment'
import { CANVAS_INTERRUPT_ON, createCanvasTools } from './canvasTools'
import { createBedrockChatModel } from './createBedrockModel'
import { PEN_DEEP_AGENT_SYSTEM_PROMPT } from './penSystemPrompt'
import { registerPenHarnessProfile } from './registerPenHarness'

export function createPenDeepAgent(env: Environment, checkpointer: MemorySaver) {
	registerPenHarnessProfile()
	const model = createBedrockChatModel(env)
	const tools = createCanvasTools()

	return createDeepAgent({
		model,
		tools,
		systemPrompt: PEN_DEEP_AGENT_SYSTEM_PROMPT,
		checkpointer,
		interruptOn: CANVAS_INTERRUPT_ON,
		subagents: [],
		backend: (config) => new StateBackend(config),
		permissions: [
			{ operations: ['read'], paths: ['/canvas/**'] },
			{ operations: ['write'], paths: ['/**'], mode: 'deny' },
		],
	})
}

export type PenDeepAgent = ReturnType<typeof createPenDeepAgent>
