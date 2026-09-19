import type { CanvasToolResult } from '../../shared/types/CanvasSnapshot'

const pendingQueues = new Map<string, CanvasToolResult[]>()

export function setPendingToolResults(threadId: string, results: CanvasToolResult[]) {
	pendingQueues.set(threadId, [...results])
}

export function takePendingToolResult(threadId: string): CanvasToolResult | undefined {
	const queue = pendingQueues.get(threadId)
	if (!queue || queue.length === 0) {
		pendingQueues.delete(threadId)
		return undefined
	}
	const result = queue.shift()
	if (!queue.length) pendingQueues.delete(threadId)
	else pendingQueues.set(threadId, queue)
	return result
}
