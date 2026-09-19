import { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw'
import { LAYER_META_KEY } from './layers/types'

function isPageParent(editor: Editor, parentId: TLParentId): boolean {
	return parentId === editor.getCurrentPageId()
}

function majority(ids: TLShapeId[]): TLShapeId | null {
	if (ids.length === 0) return null
	const counts = new Map<TLShapeId, number>()
	for (const id of ids) {
		counts.set(id, (counts.get(id) ?? 0) + 1)
	}
	let best: TLShapeId | null = null
	let bestCount = 0
	for (const [id, count] of counts) {
		if (count > bestCount) {
			bestCount = count
			best = id
		}
	}
	return best
}

/** Outermost group ancestor (Mermaid root group), or null if shape is page-level. */
function getRootGroupAncestor(editor: Editor, shapeId: TLShapeId): TLShapeId | null {
	let current: TLShape | undefined = editor.getShape(shapeId)
	if (!current) return null

	let rootGroup: TLShapeId | null = null
	while (current && !isPageParent(editor, current.parentId)) {
		const parent: TLShape | undefined = editor.getShape(current.parentId)
		if (!parent) break
		if (parent.type === 'group') {
			rootGroup = parent.id
		}
		current = parent
	}
	return rootGroup
}

/**
 * tldraw group parent for agent shapes to join the demo Mermaid family.
 * Prefers the root group of edit targets, then layered shapes on the page.
 */
export function resolveCanvasParentId(editor: Editor, targetIds: TLShapeId[] = []): TLShapeId | null {
	const fromTargets: TLShapeId[] = []
	for (const id of targetIds) {
		const root = getRootGroupAncestor(editor, id)
		if (root) {
			fromTargets.push(root)
			continue
		}
		const parentId = editor.getShape(id)?.parentId
		if (parentId && !isPageParent(editor, parentId)) {
			fromTargets.push(parentId as TLShapeId)
		}
	}
	const targetParent = majority(fromTargets)
	if (targetParent) return targetParent

	const fromLayers: TLShapeId[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (!shape.meta?.[LAYER_META_KEY]) continue
		const root = getRootGroupAncestor(editor, shape.id)
		if (root) {
			fromLayers.push(root)
		} else if (!isPageParent(editor, shape.parentId)) {
			fromLayers.push(shape.parentId as TLShapeId)
		}
	}
	return majority(fromLayers)
}

/** Move shapes into the resolved Mermaid group (page coords preserved). */
export function reparentShapesToCanvasFamily(
	editor: Editor,
	shapeIds: TLShapeId[],
	parentId: TLShapeId | null
): void {
	if (!parentId || isPageParent(editor, parentId)) return

	const toReparent = shapeIds.filter((id) => {
		const shape = editor.getShape(id)
		return shape && shape.parentId !== parentId && shape.id !== parentId
	})
	if (toReparent.length === 0) return

	editor.reparentShapes(toReparent, parentId)
}
