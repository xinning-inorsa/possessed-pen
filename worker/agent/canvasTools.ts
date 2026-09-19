import type { RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import * as z from 'zod'
import { takePendingToolResult } from './pendingToolResults'

const SimpleShapeId = z.string().describe('Simple shape ID without shape: prefix')

function getThreadId(config?: RunnableConfig): string | undefined {
	const threadId = config?.configurable?.thread_id
	return typeof threadId === 'string' ? threadId : undefined
}

function clientCanvasTool<T extends z.ZodType>(
	name: string,
	description: string,
	schema: T
) {
	return tool(
		async (args, config) => {
			const threadId = getThreadId(config)
			const result = threadId ? takePendingToolResult(threadId) : undefined
			if (result) return JSON.stringify(result)
			return JSON.stringify({
				ok: false,
				error: `Canvas tool "${name}" ran without a client result`,
			})
		},
		{ name, description, schema }
	)
}

export function createCanvasTools() {
	const inspect_shapes = clientCanvasTool(
		'inspect_shapes',
		'Inspect shapes on the canvas. Returns type, bounds, and labels. Omit shapeIds to inspect all shapes in view.',
		z.object({
			shapeIds: z.array(SimpleShapeId).optional(),
			intent: z.string().optional(),
		})
	)

	const label = clientCanvasTool(
		'label',
		"Change a shape's label text.",
		z.object({
			intent: z.string(),
			shapeId: SimpleShapeId,
			text: z.string(),
		})
	)

	const delete_shape = clientCanvasTool(
		'delete_shape',
		'Delete a shape from the canvas.',
		z.object({
			intent: z.string(),
			shapeId: SimpleShapeId,
		})
	)

	const create = clientCanvasTool(
		'create',
		'Create exactly ONE new shape (e.g. one box or arrow). Always follow with place relative to a reference — never recreate an existing diagram.',
		z.object({
			intent: z.string(),
			shape: z
				.record(z.string(), z.unknown())
				.describe(
					'New shape: { _type: "rectangle", shapeId: "new-lb", text: "Load Balancer" } — omit x,y; call place next'
				),
		})
	)

	const place = clientCanvasTool(
		'place',
		'Place a shape relative to a reference shape.',
		z.object({
			intent: z.string(),
			shapeId: SimpleShapeId,
			referenceShapeId: SimpleShapeId,
			side: z.enum(['top', 'bottom', 'left', 'right']),
			sideOffset: z.number(),
			align: z.enum(['start', 'center', 'end']),
			alignOffset: z.number(),
		})
	)

	const update = clientCanvasTool(
		'update',
		'Update an existing shape (partial shape object with shapeId).',
		z.object({
			intent: z.string(),
			update: z.record(z.string(), z.unknown()),
		})
	)

	const connect_shapes = clientCanvasTool(
		'connect_shapes',
		'Draw an arrow between two existing shapes. Use after adding boxes so the diagram stays wired.',
		z.object({
			intent: z.string(),
			fromShapeId: SimpleShapeId,
			toShapeId: SimpleShapeId,
			text: z.string().optional().describe('Optional arrow label'),
		})
	)

	return [inspect_shapes, label, delete_shape, create, place, connect_shapes, update]
}

export type CanvasToolName =
	| 'inspect_shapes'
	| 'label'
	| 'delete_shape'
	| 'create'
	| 'place'
	| 'connect_shapes'
	| 'update'

export const CANVAS_INTERRUPT_ON: Record<string, true> = {
	inspect_shapes: true,
	label: true,
	delete_shape: true,
	create: true,
	place: true,
	connect_shapes: true,
	update: true,
}

export function extractHitlInterrupts(
	value: unknown
): Array<{ tool: string; args: Record<string, unknown> }> {
	if (!value || typeof value !== 'object') return []
	const hitl = value as {
		actionRequests?: Array<{ name?: string; args?: Record<string, unknown> }>
	}
	return (hitl.actionRequests ?? [])
		.filter((req): req is { name: string; args?: Record<string, unknown> } => {
			return typeof req.name === 'string'
		})
		.map((req) => ({
			tool: req.name,
			args: req.args ?? {},
		}))
}
