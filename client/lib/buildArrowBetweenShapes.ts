import { Box, Editor } from 'tldraw'
import type { FocusedArrowShape } from '../../shared/format/FocusedShape'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import { toTldrawShapeId } from './normalizeShapeId'

function pickAnchors(from: Box, to: Box): { x1: number; y1: number; x2: number; y2: number } {
	const dx = to.midX - from.midX
	const dy = to.midY - from.midY

	if (Math.abs(dx) >= Math.abs(dy)) {
		if (dx >= 0) {
			return { x1: from.maxX, y1: from.midY, x2: to.minX, y2: to.midY }
		}
		return { x1: from.minX, y1: from.midY, x2: to.maxX, y2: to.midY }
	}

	if (dy >= 0) {
		return { x1: from.midX, y1: from.maxY, x2: to.midX, y2: to.minY }
	}
	return { x1: from.midX, y1: from.minY, x2: to.midX, y2: to.maxY }
}

/** Build a focused arrow from two existing shapes (page-space anchors). */
export function buildArrowBetweenShapes(
	editor: Editor,
	fromShapeId: SimpleShapeId,
	toShapeId: SimpleShapeId,
	options?: { text?: string; shapeId?: SimpleShapeId }
): FocusedArrowShape | null {
	const fromShape = editor.getShape(toTldrawShapeId(fromShapeId))
	const toShape = editor.getShape(toTldrawShapeId(toShapeId))
	if (!fromShape || !toShape) return null

	const fromBounds = editor.getShapePageBounds(fromShape)
	const toBounds = editor.getShapePageBounds(toShape)
	if (!fromBounds || !toBounds) return null

	const { x1, y1, x2, y2 } = pickAnchors(fromBounds, toBounds)
	const shapeId =
		options?.shapeId ?? (`arrow-${crypto.randomUUID().slice(0, 8)}` as SimpleShapeId)

	return {
		_type: 'arrow',
		shapeId,
		fromId: fromShapeId,
		toId: toShapeId,
		x1,
		y1,
		x2,
		y2,
		bend: 0,
		color: 'black',
		note: '',
		text: options?.text ?? '',
	}
}
