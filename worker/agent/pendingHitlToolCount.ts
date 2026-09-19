const pendingCounts = new Map<string, number>()

export function setPendingHitlToolCount(threadId: string, count: number) {
	pendingCounts.set(threadId, count)
}

export function takePendingHitlToolCount(threadId: string): number | undefined {
	const count = pendingCounts.get(threadId)
	pendingCounts.delete(threadId)
	return count
}
