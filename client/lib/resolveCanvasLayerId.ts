import { Editor, TLShapeId } from 'tldraw'
import { LAYER_META_KEY } from './layers/types'

/** Layer id from target shapes, or any shape on the page (e.g. demo Mermaid stack). */
export function resolveCanvasLayerId(editor: Editor, targetIds: TLShapeId[] = []): string | null {
	for (const id of targetIds) {
		const layerId = editor.getShape(id)?.meta?.[LAYER_META_KEY]
		if (typeof layerId === 'string' && layerId.length > 0) return layerId
	}

	for (const shape of editor.getCurrentPageShapes()) {
		const layerId = shape.meta?.[LAYER_META_KEY]
		if (typeof layerId === 'string' && layerId.length > 0) return layerId
	}

	return null
}
