import { Editor, TLShapeId } from 'tldraw'

/** Duration of the pen-stroke reveal per shape. */
const DRAW_MS = 480
/** Stagger between shapes created in the same batch. */
const STAGGER_MS = 90

/**
 * Hand-drawn reveal: hide the shape, then animate opacity 0 → 1 with a quick
 * ease so it reads as "drawn in" rather than popping. Arrows get the same
 * treatment — tldraw re-renders on the store change, so no overlay canvas
 * is needed and nothing can ghost.
 */
export function animateDrawOn(editor: Editor, shapeIds: TLShapeId[]): void {
	if (shapeIds.length === 0) return

	// Hide immediately.
	for (const id of shapeIds) {
		const shape = editor.getShape(id)
		if (shape) editor.updateShape({ id, type: shape.type, opacity: 0 })
	}

	shapeIds.forEach((id, index) => {
		const delay = index * STAGGER_MS
		window.setTimeout(() => {
			const shape = editor.getShape(id)
			if (!shape || shape.opacity !== 0) return
			editor.animateShape(
				{ id, type: shape.type, opacity: 1 },
				{ animation: { duration: DRAW_MS, easing: (t) => 1 - Math.pow(1 - t, 3) } }
			)
		}, delay)
	})
}
