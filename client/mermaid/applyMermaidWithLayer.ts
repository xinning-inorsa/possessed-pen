import { createMermaidDiagram } from '@tldraw/mermaid'
import { Editor, TLShapeId } from 'tldraw'
import type { Layer } from '../layers/LayerContext'
import {
	findNewShapeIds,
	revealShapesProgressively,
	snapshotShapeIds,
} from './revealShapesProgressively'

export type ApplyMermaidOptions = {
	position?: { x: number; y: number }
	centerOnPosition?: boolean
	layerId?: string
}

export async function applyMermaidWithLayer(
	editor: Editor,
	mermaid: string,
	layer: Pick<Layer, 'id'>,
	options: ApplyMermaidOptions = {}
): Promise<string[]> {
	const before = snapshotShapeIds(editor)
	await createMermaidDiagram(editor, mermaid, {
		blueprintRender: {
			position: options.position,
			centerOnPosition: options.centerOnPosition ?? !options.position,
		},
	})
	const created = findNewShapeIds(editor, before)
	if (created.length) {
		editor.updateShapes(
			created.map((id) => ({
				id,
				type: editor.getShape(id)!.type,
				meta: { ...editor.getShape(id)!.meta, layerId: layer.id },
			}))
		)
		void revealShapesProgressively(editor, created)
	}
	return created
}
