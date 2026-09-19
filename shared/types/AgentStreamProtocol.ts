import type { CanvasSnapshot, CanvasToolResult } from './CanvasSnapshot'

export type AgentStreamStartRequest = {
	type: 'start'
	threadId: string
	canvas: CanvasSnapshot
	message: string
}

export type CanvasToolCall = {
	tool: string
	args: Record<string, unknown>
}

export type AgentStreamResumeRequest = {
	type: 'resume'
	threadId: string
	resume: CanvasToolResult[]
}

export type AgentStreamRequest = AgentStreamStartRequest | AgentStreamResumeRequest

export type AgentStreamInterruptEvent = {
	type: 'interrupt'
	threadId: string
	tools: CanvasToolCall[]
}

export type AgentStreamDoneEvent = {
	type: 'done'
	threadId: string
}

export type AgentStreamErrorEvent = {
	type: 'error'
	message: string
}

export type AgentStreamEvent =
	| AgentStreamInterruptEvent
	| AgentStreamDoneEvent
	| AgentStreamErrorEvent
