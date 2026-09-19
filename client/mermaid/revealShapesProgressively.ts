import { Editor, TLShapeId } from 'tldraw'

/** Delay between revealing each shape. */
export const REVEAL_INTERVAL_MS = 40

/** Optional fade-in duration per shape via `editor.animateShape`. */
export const REVEAL_FADE_MS = 120

export type RevealShapesOptions = {
	intervalMs?: number
	fadeMs?: number
}

export function snapshotShapeIds(editor: Editor): Set<TLShapeId> {
	return new Set(editor.getCurrentPageShapeIds())
}

export function findNewShapeIds(editor: Editor, before: Set<TLShapeId>): TLShapeId[] {
	return [...editor.getCurrentPageShapeIds()].filter((id) => !before.has(id))
}

function getRevealTier(type: string): number {
	if (type === 'arrow') return 2
	if (type === 'line') return 1
	return 0
}

function getRevealPosition(editor: Editor, id: TLShapeId): { x: number; y: number } {
	const shape = editor.getShape(id)
	if (!shape) return { x: 0, y: 0 }
	const bounds = editor.getShapePageBounds(id)
	return { x: bounds?.x ?? shape.x, y: bounds?.y ?? shape.y }
}

export function sortShapesForReveal(editor: Editor, shapeIds: TLShapeId[]): TLShapeId[] {
	return [...shapeIds].sort((a, b) => {
		const shapeA = editor.getShape(a)
		const shapeB = editor.getShape(b)
		if (!shapeA || !shapeB) return 0

		const tierA = getRevealTier(shapeA.type)
		const tierB = getRevealTier(shapeB.type)
		if (tierA !== tierB) return tierA - tierB

		const posA = getRevealPosition(editor, a)
		const posB = getRevealPosition(editor, b)
		if (posA.y !== posB.y) return posA.y - posB.y
		return posA.x - posB.x
	})
}

export function hideShapes(editor: Editor, shapeIds: TLShapeId[]) {
	if (!shapeIds.length) return
	editor.updateShapes(
		shapeIds.map((id) => {
			const shape = editor.getShape(id)!
			return { id, type: shape.type, opacity: 0 }
		})
	)
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Layout is already on canvas; hide new shapes then reveal nodes (top-down), lines, then arrows.
 */
export async function revealShapesProgressively(
	editor: Editor,
	shapeIds: TLShapeId[],
	options: RevealShapesOptions = {}
): Promise<void> {
	if (!shapeIds.length) return

	const intervalMs = options.intervalMs ?? REVEAL_INTERVAL_MS
	const fadeMs = options.fadeMs ?? REVEAL_FADE_MS

	hideShapes(editor, shapeIds)
	const ordered = sortShapesForReveal(editor, shapeIds)

	for (const id of ordered) {
		const shape = editor.getShape(id)
		if (!shape) continue

		if (fadeMs > 0) {
			editor.animateShape(
				{ id, type: shape.type, opacity: 1 },
				{ animation: { duration: fadeMs } }
			)
		} else {
			editor.updateShape({ id, type: shape.type, opacity: 1 })
		}

		await sleep(intervalMs)
	}
}
