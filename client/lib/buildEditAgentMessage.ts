import { Editor, TLShapeId } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { getShapeLabel } from './deixisResolver'

function buildRefsContext(refs: SpatialRef[]): string {
	return refs
		.map((ref) => {
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
		'Edit the existing diagram on the canvas. Patch shapes in place — do not redraw the whole board.',
		'Prefer label, update, delete, create+place (relative to a reference shape), and arrows with fromId/toId.',
		'Only use apply_mermaid when the user explicitly asked to replace or restructure a cluster.',
		'Never use pen. Do not lay out an entire new diagram with raw x,y coordinates.',
	]

	if (options.targetShapeIds.length) {
		const labels = options.targetShapeIds
			.map((id) => getShapeLabel(options.editor, id))
			.filter((l) => l && !l.startsWith('shape:'))
		parts.push(
			`Target shapes (${options.targetShapeIds.length}): ${labels.length ? labels.join(', ') : options.targetShapeIds.join(', ')}`
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
