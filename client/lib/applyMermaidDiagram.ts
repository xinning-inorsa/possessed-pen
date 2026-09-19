import { createMermaidDiagram } from '@tldraw/mermaid'
import { Box, Editor, TLShape, TLShapeId } from 'tldraw'
import {
	findNewShapeIds,
	revealShapesProgressively,
	snapshotShapeIds,
} from '../mermaid/revealShapesProgressively'
import { Layer } from './layers/types'
import { LAYER_META_KEY } from './layers/types'

export async function applyMermaidDiagram(
	editor: Editor,
	mermaidText: string,
	options: {
		layer: Layer
		position?: { x: number; y: number }
		centerOnPosition?: boolean
	}
): Promise<string[]> {
	const beforeIds = snapshotShapeIds(editor)

	await createMermaidDiagram(editor, mermaidText, {
		blueprintRender: {
			position: options.position,
			centerOnPosition: options.centerOnPosition ?? !options.position,
		},
	})

	const created = findNewShapeIds(editor, beforeIds)

	for (const id of created) {
		const shape = editor.getShape(id)!
		editor.updateShape({
			id,
			type: shape.type,
			meta: { ...shape.meta, [LAYER_META_KEY]: options.layer.id },
		})
	}

	if (created.length) {
		void revealShapesProgressively(editor, created)
	}

	return created
}

export function getSelectionBounds(editor: Editor, shapeIds: TLShapeId[]): Box | null {
	if (shapeIds.length === 0) return null
	const shapes = shapeIds.map((id) => editor.getShape(id)).filter(Boolean) as TLShape[]
	if (shapes.length === 0) return null
	return Box.Common(shapes.map((shape) => editor.getShapePageBounds(shape)!))
}

export function snapshotShapes(editor: Editor, shapeIds: TLShapeId[]): TLShape[] {
	return shapeIds
		.map((id) => editor.getShape(id))
		.filter(Boolean)
		.map((shape) => structuredClone(shape)) as TLShape[]
}

export function restoreShapes(editor: Editor, shapes: TLShape[]) {
	for (const shape of shapes) {
		editor.createShape(shape as any)
	}
}
