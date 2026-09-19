import { Editor, TLShapeId } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { getShapeLabel } from './deixisResolver'

function buildRefsContext(refs: SpatialRef[]): string {
	return refs
		.map((ref) => {
			if (ref.pagePoint) {
				const { x, y } = ref.pagePoint
				return `- "${ref.word}" → empty canvas at (${Math.round(x)}, ${Math.round(y)})`
			}
			const labels = ref.labels?.length ? ref.labels.join(', ') : ref.shapeIds.join(', ')
			return `- "${ref.word}" → ${labels} (ids: ${ref.shapeIds.join(', ')})`
		})
		.join('\n')
}

function buildMovementContext(context: MovementContext): string {
	const lines: string[] = []
	if (context.hoveredShapeIds.length) {
		lines.push(`Hovered during utterance: ${context.hoveredShapeIds.join(', ')}`)
	}
	for (const dwell of context.dwellRegions) {
		const labels = dwell.labels?.length ? dwell.labels.join(', ') : dwell.shapeIds.join(', ')
		lines.push(`- Dwell ${Math.round(dwell.durationMs)}ms on: ${labels}`)
	}
	for (const circle of context.circledRegions) {
		const labels = circle.labels?.length ? circle.labels.join(', ') : circle.shapeIds.join(', ')
		const { x, y, w, h } = circle.bounds
		lines.push(
			`- Circled (${Math.round(w)}×${Math.round(h)} at ${Math.round(x)},${Math.round(y)}): ${labels}`
		)
	}
	for (const click of context.clickRegions) {
		const labels = click.labels?.length ? click.labels.join(', ') : click.shapeIds.join(', ')
		const point = click.pagePoint
			? ` at (${Math.round(click.pagePoint.x)}, ${Math.round(click.pagePoint.y)})`
			: ''
		lines.push(`- Clicked at ${Math.round(click.tMs)}ms: ${labels || 'empty canvas'}${point}`)
	}
	return lines.join('\n')
}

export function buildEditAgentMessage(
	prompt: string,
	options: {
		editor: Editor
		targetShapeIds: TLShapeId[]
		refs?: SpatialRef[]
		movementContext?: MovementContext
	}
): string {
	const parts: string[] = [
		'Edit the existing diagram on the canvas. Read /canvas/topology.md for the full chart before mutating.',
		'Patch in place — do not redraw the board. Batch create+place pairs in one turn when adding a small stack.',
		'Never regenerate or redraw the whole diagram. Never stack a new flowchart on top of the existing one.',
		'Replacing one node with a small stack is OK — create+place boxes, connect_shapes to wire them and to downstream (see topology.md), then delete only the targeted node.',
		'Fan-out (e.g. load balancer → servers): connect every parallel branch to the same downstream the replaced node had — not just one branch.',
		'Read /canvas/spacing.md for overlaps. Use place with sideOffset ~140 for vertical stacks, alignOffset ~100 between horizontal fan-out siblings; the client tidies spacing after your edit.',
		'Never use pen. Do not lay out an entire diagram with raw x,y coordinates.',
	]

	if (options.targetShapeIds.length) {
		const labels = options.targetShapeIds
			.map((id) => getShapeLabel(options.editor, id))
			.filter((l) => l && !l.startsWith('shape:'))
		parts.push(
			`Target shapes (${options.targetShapeIds.length}): ${labels.length ? labels.join(', ') : options.targetShapeIds.join(', ')}`
		)
	} else {
		parts.push(
			'No explicit selection — read /canvas/shapes.json and use inspect_shapes to find targets. Edit existing shapes only; do not add a parallel copy of the diagram.'
		)
	}

	if (options.refs?.length) {
		parts.push('Voice / pointer references:')
		parts.push(buildRefsContext(options.refs))
	}

	if (options.movementContext) {
		parts.push('Pointer movement:')
		parts.push(buildMovementContext(options.movementContext))
	}

	parts.push(`User request: ${prompt.trim()}`)
	return parts.join('\n\n')
}
