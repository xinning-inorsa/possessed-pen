import { Editor, useValue } from 'tldraw'
import { useLayers } from '../layers/LayerContext'

/** True when the canvas has no ink yet (no shapes and no layers). */
export function useEmptyCanvas(editor: Editor) {
	const { layers } = useLayers()
	const shapeCount = useValue(
		'shapeCount',
		() => editor.getCurrentPageShapeIds().size,
		[editor]
	)
	return shapeCount === 0 && layers.length === 0
}
