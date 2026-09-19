import { Box, Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { parseApiError } from '../lib/parseApiError'
import { applyMermaidWithLayer } from './applyMermaidWithLayer'
import type { Layer } from '../layers/LayerContext'

const MAX_SELECTION = 12
/** Same-layer shapes inside the selection AABB (e.g. missed arrows). */
const MAX_REPLACE_SHAPES = 48

export type ReplaceInBoundsResult =
	| { ok: true; shapeIds: string[] }
	| { ok: false; reason: string }

export function getSelectionBounds(editor: Editor, shapeIds: TLShapeId[]): Box | null {
	const shapes = shapeIds
		.map((id) => editor.getShape(id))
		.filter((s): s is TLShape => !!s)
	if (!shapes.length) return null
	return Box.Common(shapes.map((s) => editor.getShapePageBounds(s)!))
}

/** Include same-layer shapes in the AABB so arrows/labels missed by lasso are removed too. */
export function expandReplaceTargets(
	editor: Editor,
	selectedIds: TLShapeId[],
	bounds: Box
): TLShapeId[] {
	const selected = new Set(selectedIds)
	const layerIds = new Set<string>()
	for (const id of selectedIds) {
		const layerId = editor.getShape(id)?.meta?.layerId as string | undefined
		if (layerId) layerIds.add(layerId)
	}

	const expanded = new Set(selectedIds)
	for (const shape of editor.getCurrentPageShapes()) {
		if (selected.has(shape.id)) continue
		const shapeBounds = editor.getShapePageBounds(shape)
		if (!shapeBounds || !bounds.collides(shapeBounds)) continue
		if (layerIds.size > 0) {
			const layerId = shape.meta?.layerId as string | undefined
			if (!layerId || !layerIds.has(layerId)) continue
		}
		expanded.add(shape.id)
	}
	return [...expanded]
}

export async function replaceInBounds(
	editor: Editor,
	shapeIds: TLShapeId[],
	mermaid: string,
	layer: Pick<Layer, 'id'>
): Promise<ReplaceInBoundsResult> {
	if (shapeIds.length === 0) {
		return { ok: false, reason: 'No shapes selected' }
	}
	if (shapeIds.length > MAX_SELECTION) {
		return { ok: false, reason: 'Select a smaller cluster (max 12 shapes)' }
	}

	const bounds = getSelectionBounds(editor, shapeIds)
	if (!bounds) {
		return { ok: false, reason: 'Could not compute selection bounds' }
	}

	const idsToReplace = expandReplaceTargets(editor, shapeIds, bounds)
	if (idsToReplace.length > MAX_REPLACE_SHAPES) {
		return { ok: false, reason: 'Select a smaller cluster to replace' }
	}

	const snapshot: TLShapePartial[] = idsToReplace.map((id) => {
		const shape = editor.getShape(id)!
		return structuredClone(shape) as TLShapePartial
	})

	editor.deleteShapes(idsToReplace)

	try {
		const created = await applyMermaidWithLayer(editor, mermaid, layer, {
			position: { x: bounds.x, y: bounds.y },
			centerOnPosition: false,
		})
		return { ok: true, shapeIds: created }
	} catch (e) {
		console.error('replaceInBounds failed, restoring snapshot', e)
		for (const partial of snapshot) {
			editor.createShape(partial)
		}
		return { ok: false, reason: 'Regeneration failed; selection restored' }
	}
}

export async function fetchMermaid(
	prompt: string,
	context?: string,
	refs?: SpatialRef[]
): Promise<string> {
	const res = await fetch('/api/generate-mermaid', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt, context, refs }),
	})
	if (!res.ok) {
		const msg = await res.text()
		throw new Error(parseApiError(msg, `Generation failed (${res.status})`))
	}
	const data = (await res.json()) as { mermaid: string }
	return data.mermaid
}
