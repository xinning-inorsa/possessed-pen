import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { toSimpleShapeId } from './normalizeShapeId'

function findShapeIdByLabel(agent: TldrawAgent, label: string): SimpleShapeId | null {
	const needle = label.trim().toLowerCase()
	if (!needle) return null

	for (const shape of agent.editor.getCurrentPageShapes()) {
		const text = agent.editor.getShapeUtil(shape).getText(shape)?.trim().toLowerCase()
		if (text === needle) {
			return convertTldrawIdToSimpleId(shape.id)
		}
	}
	return null
}

/** Resolve a tool shapeId — real id, label text, or single selection fallback. */
export function resolveShapeIdForEdit(
	agent: TldrawAgent,
	helpers: AgentHelpers,
	rawId: string
): SimpleShapeId | null {
	const simpleId = toSimpleShapeId(rawId)
	const existing = helpers.ensureShapeIdExists(simpleId)
	if (existing) return existing

	const byLabel = findShapeIdByLabel(agent, rawId)
	if (byLabel && helpers.ensureShapeIdExists(byLabel)) return byLabel

	const selected = agent.editor.getSelectedShapeIds()
	if (selected.length === 1) {
		const selectedId = convertTldrawIdToSimpleId(selected[0])
		if (helpers.ensureShapeIdExists(selectedId)) return selectedId
	}

	return null
}

export function resolveToolArgs(
	agent: TldrawAgent,
	helpers: AgentHelpers,
	tool: string,
	args: Record<string, unknown>
): Record<string, unknown> {
	if (tool === 'connect_shapes') {
		const next = { ...args }
		if ('fromShapeId' in args) {
			const resolved = resolveShapeIdForEdit(agent, helpers, String(args.fromShapeId ?? ''))
			if (resolved) next.fromShapeId = resolved
		}
		if ('toShapeId' in args) {
			const resolved = resolveShapeIdForEdit(agent, helpers, String(args.toShapeId ?? ''))
			if (resolved) next.toShapeId = resolved
		}
		return next
	}

	if (tool === 'update') {
		const update = args.update
		if (!update || typeof update !== 'object' || !('shapeId' in update)) return args
		const resolved = resolveShapeIdForEdit(agent, helpers, String(update.shapeId))
		if (!resolved) return args
		return { ...args, update: { ...update, shapeId: resolved } }
	}

	if (!('shapeId' in args) && !('referenceShapeId' in args)) return args

	const next = { ...args }
	if ('shapeId' in args) {
		const resolved = resolveShapeIdForEdit(agent, helpers, String(args.shapeId ?? ''))
		if (resolved) next.shapeId = resolved
	}
	if ('referenceShapeId' in args) {
		const resolved = resolveShapeIdForEdit(agent, helpers, String(args.referenceShapeId ?? ''))
		if (resolved) next.referenceShapeId = resolved
	}
	return next
}
