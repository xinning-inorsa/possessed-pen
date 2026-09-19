import type { RecordsDiff, TLRecord } from 'tldraw'

export function recordsDiffHasChanges(diff: RecordsDiff<TLRecord>): boolean {
	return (
		Object.keys(diff.added).length > 0 ||
		Object.keys(diff.updated).length > 0 ||
		Object.keys(diff.removed).length > 0
	)
}
