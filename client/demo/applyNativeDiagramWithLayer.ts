import { Editor, TLShape } from 'tldraw'
import { convertFocusedShapeToTldrawShape } from '../../shared/format/convertFocusedShapeToTldrawShape'
import type { FocusedShape } from '../../shared/format/FocusedShape'
import type { Layer } from '../layers/LayerContext'
import { buildArrowBetweenShapes } from '../lib/buildArrowBetweenShapes'
import { LAYER_META_KEY } from '../lib/layers/types'
import {
	findNewShapeIds,
	revealShapesProgressively,
	snapshotShapeIds,
} from '../mermaid/revealShapesProgressively'
import type { NativeDiagram } from './authFlowNative'

export type ApplyNativeDiagramOptions = {
	position?: { x: number; y: number }
}

function createFocusedShape(editor: Editor, shape: FocusedShape) {
	const { shape: tlShape, bindings } = convertFocusedShapeToTldrawShape(editor, shape, {
		defaultShape: {} as Partial<TLShape>,
	})
	editor.createShape(tlShape)
	if (bindings) {
		for (const binding of bindings) {
			editor.createBinding(binding)
		}
	}
}

export async function applyNativeDiagramWithLayer(
	editor: Editor,
	diagram: NativeDiagram,
	layer: Pick<Layer, 'id'>,
	options: ApplyNativeDiagramOptions = {}
): Promise<string[]> {
	const before = snapshotShapeIds(editor)
	const offset = options.position ?? { x: 0, y: 0 }

	for (const node of diagram.nodes) {
		createFocusedShape(editor, {
			...node,
			x: node.x + offset.x,
			y: node.y + offset.y,
		})
	}

	for (const connection of diagram.connections) {
		const arrow = buildArrowBetweenShapes(editor, connection.from, connection.to, {
			text: connection.text,
		})
		if (arrow) {
			createFocusedShape(editor, arrow)
		}
	}

	const created = findNewShapeIds(editor, before)
	if (created.length) {
		editor.updateShapes(
			created.map((id) => ({
				id,
				type: editor.getShape(id)!.type,
				meta: { ...editor.getShape(id)!.meta, [LAYER_META_KEY]: layer.id },
			}))
		)
		await revealShapesProgressively(editor, created)
	}

	return created.map((id) => id as string)
}
