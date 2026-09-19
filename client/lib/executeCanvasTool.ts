import { Box, BoxModel, Editor, TLShapeId } from 'tldraw'
import { convertTldrawShapeToBlurryShape } from '../../shared/format/convertTldrawShapeToBlurryShape'
import type { BlurryShape } from '../../shared/format/BlurryShape'
import { buildArrowBetweenShapes } from './buildArrowBetweenShapes'
import { getEditSession } from './editSession'
import { normalizeCreateShape } from './normalizeCreateShape'
import type { CanvasToolResult } from '../../shared/types/CanvasSnapshot'
import type { AgentAction } from '../../shared/types/AgentAction'
import type { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { buildCanvasTopology, formatTopologyMarkdown } from './buildCanvasTopology'
import { recordsDiffHasChanges } from './canvasDiff'
import { toSimpleShapeId } from './normalizeShapeId'
import { resolveToolArgs } from './resolveShapeIdForEdit'

const DEFAULT_BOX_W = 168
const DEFAULT_BOX_H = 72

/** Offset-space default when create omits x,y — beside edit targets or viewport center. */
function getDefaultCreateOffsetPosition(
	agent: TldrawAgent,
	helpers: AgentHelpers,
	viewportBounds: BoxModel
): { x: number; y: number } {
	const session = getEditSession()
	const targetIds: TLShapeId[] =
		session?.replaceShapeIds?.length
			? session.replaceShapeIds
			: (agent.editor.getSelectedShapeIds() as TLShapeId[])

	if (targetIds.length) {
		const pageBounds = agent.editor.getShapesPageBounds(targetIds)
		if (pageBounds) {
			return helpers.applyOffsetToVec({
				x: pageBounds.maxX + 24,
				y: pageBounds.midY - DEFAULT_BOX_H / 2,
			})
		}
	}

	return {
		x: Math.round(viewportBounds.w / 2 - DEFAULT_BOX_W / 2),
		y: Math.round(viewportBounds.h / 2 - DEFAULT_BOX_H / 2),
	}
}

/** Live shapes intersecting the current viewport, coords offset to match shapes.json. */
function blurryShapesInBounds(
	editor: Editor,
	helpers: AgentHelpers
): BlurryShape[] {
	const box = Box.From(editor.getViewportPageBounds())
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape) => {
			const shapeBounds = editor.getShapeMaskedPageBounds(shape)
			return shapeBounds ? box.collides(shapeBounds) : false
		})
		.map((shape) => convertTldrawShapeToBlurryShape(editor, shape))
		.filter((s): s is BlurryShape => s !== null)
		.map((shape) => {
			const offset = helpers.applyOffsetToBox({
				x: shape.x,
				y: shape.y,
				w: shape.w,
				h: shape.h,
			})
			return { ...shape, x: offset.x, y: offset.y }
		})
}

function inspectShapes(
	editor: Editor,
	args: Record<string, unknown>,
	helpers: AgentHelpers
): CanvasToolResult {
	const requestedIds = Array.isArray(args.shapeIds)
		? (args.shapeIds as string[]).map(toSimpleShapeId)
		: []

	const all = blurryShapesInBounds(editor, helpers)
	const idSet = new Set(requestedIds.map(String))
	const shapes =
		requestedIds.length > 0 ? all.filter((s) => idSet.has(s.shapeId)) : all

	return { ok: true, shapes, topology: formatTopologyMarkdown(buildCanvasTopology(editor)) }
}

function toolToAction(
	tool: string,
	args: Record<string, unknown>,
	defaultCreatePosition?: { x: number; y: number }
): AgentAction | null {
	switch (tool) {
		case 'label':
			return {
				_type: 'label',
				intent: String(args.intent ?? ''),
				shapeId: toSimpleShapeId(String(args.shapeId ?? '')),
				text: String(args.text ?? ''),
			}
		case 'delete_shape':
			return {
				_type: 'delete',
				intent: String(args.intent ?? ''),
				shapeId: toSimpleShapeId(String(args.shapeId ?? '')),
			}
		case 'create': {
			const shape = normalizeCreateShape(
				args.shape,
				String(args.intent ?? ''),
				defaultCreatePosition
			)
			if (!shape) return null
			return {
				_type: 'create',
				intent: String(args.intent ?? ''),
				shape: shape as AgentAction extends { _type: 'create' } ? never : never,
			} as AgentAction
		}
		case 'place':
			return {
				_type: 'place',
				intent: String(args.intent ?? ''),
				shapeId: toSimpleShapeId(String(args.shapeId ?? '')),
				referenceShapeId: toSimpleShapeId(String(args.referenceShapeId ?? '')),
				side: args.side as 'top' | 'bottom' | 'left' | 'right',
				sideOffset: Number(args.sideOffset ?? 80),
				align: args.align as 'start' | 'center' | 'end',
				alignOffset: Number(args.alignOffset ?? 0),
			}
		case 'update':
			return {
				_type: 'update',
				intent: String(args.intent ?? ''),
				update: args.update as AgentAction extends { _type: 'update' } ? never : never,
			} as AgentAction
		case 'apply_mermaid':
			return {
				_type: 'apply_mermaid',
				intent: String(args.intent ?? ''),
				mermaid: String(args.mermaid ?? ''),
			}
		default:
			return null
	}
}

export async function executeCanvasTool(
	agent: TldrawAgent,
	tool: string,
	args: Record<string, unknown>,
	helpers: AgentHelpers,
	bounds: { x: number; y: number; w: number; h: number }
): Promise<CanvasToolResult> {
	if (tool === 'inspect_shapes') {
		return inspectShapes(agent.editor, args, helpers)
	}

	if (tool === 'connect_shapes') {
		const resolvedArgs = resolveToolArgs(agent, helpers, tool, args)
		const fromShapeId = toSimpleShapeId(String(resolvedArgs.fromShapeId ?? ''))
		const toShapeId = toSimpleShapeId(String(resolvedArgs.toShapeId ?? ''))
		const label = typeof resolvedArgs.text === 'string' ? resolvedArgs.text : undefined

		const arrow = buildArrowBetweenShapes(agent.editor, fromShapeId, toShapeId, { text: label })
		if (!arrow) {
			return { ok: false, error: 'Could not connect — fromShapeId or toShapeId not found' }
		}

		// buildArrowBetweenShapes returns page-space anchors; CreateActionUtil removes the
		// request offset, so pre-apply it to land the arrow at the right page position.
		const start = helpers.applyOffsetToVec({ x: arrow.x1, y: arrow.y1 })
		const end = helpers.applyOffsetToVec({ x: arrow.x2, y: arrow.y2 })
		arrow.x1 = start.x
		arrow.y1 = start.y
		arrow.x2 = end.x
		arrow.y2 = end.y

		const actionUtil = agent.actions.getAgentActionUtil('create')
		const streamingAction = {
			_type: 'create' as const,
			intent: String(resolvedArgs.intent ?? 'Connect shapes'),
			shape: arrow,
			complete: true,
			time: 0,
		} as Streaming<AgentAction>
		const sanitized = actionUtil.sanitizeAction(streamingAction, helpers)
		if (!sanitized) {
			return { ok: false, error: 'Could not connect shapes — invalid endpoints' }
		}

		try {
			const { promise, diff } = agent.actions.act(sanitized, helpers, { reportError: false })
			if (promise) await promise
			if (!recordsDiffHasChanges(diff)) {
				return { ok: false, error: 'No arrow created — shapes may already be connected' }
			}
			return {
				ok: true,
				shapes: blurryShapesInBounds(agent.editor, helpers),
				topology: formatTopologyMarkdown(buildCanvasTopology(agent.editor)),
			}
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) }
		}
	}

	const resolvedArgs = resolveToolArgs(agent, helpers, tool, args)
	const defaultCreatePosition =
		tool === 'create' ? getDefaultCreateOffsetPosition(agent, helpers, bounds) : undefined
	const action = toolToAction(tool, resolvedArgs, defaultCreatePosition)
	if (!action) {
		if (tool === 'create') {
			return {
				ok: false,
				error: 'Invalid create shape — use _type rectangle with text, then place beside a reference',
			}
		}
		return { ok: false, error: `Unknown canvas tool: ${tool}` }
	}

	const actionUtil = agent.actions.getAgentActionUtil(action._type)
	const streamingAction = { ...action, complete: true, time: 0 } as Streaming<AgentAction>
	const sanitized = actionUtil.sanitizeAction(streamingAction, helpers)
	if (!sanitized) {
		return { ok: false, error: `Could not apply ${tool} — invalid args or missing shape` }
	}

	try {
		const { promise, diff } = agent.actions.act(sanitized, helpers, { reportError: false })
		if (promise) await promise
		if (!recordsDiffHasChanges(diff)) {
			return {
				ok: false,
				error: `No canvas changes from ${tool} — check shapeId in shapes.json`,
			}
		}
		return {
			ok: true,
			shapes: blurryShapesInBounds(agent.editor, helpers),
			topology: formatTopologyMarkdown(buildCanvasTopology(agent.editor)),
		}
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}
