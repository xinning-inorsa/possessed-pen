import type { CanvasSnapshot } from '../../shared/types/CanvasSnapshot'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import type { MovementContext } from '../../shared/types/MovementContext'

type FileData = {
	content: string[]
	created_at: string
	modified_at: string
}

function makeFile(text: string): FileData {
	const now = new Date().toISOString()
	return {
		content: text.split('\n'),
		created_at: now,
		modified_at: now,
	}
}

function buildDeixisMarkdown(refs: SpatialRef[]): string {
	if (!refs.length) return 'No deictic references resolved.'
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

function buildPointerMarkdown(movement?: MovementContext): string {
	if (!movement) return 'No pointer movement recorded during utterance.'
	const lines: string[] = []
	if (movement.hoveredShapeIds.length) {
		lines.push(`Hovered during utterance: ${movement.hoveredShapeIds.join(', ')}`)
	}
	for (const dwell of movement.dwellRegions) {
		const labels = dwell.labels?.length ? dwell.labels.join(', ') : dwell.shapeIds.join(', ')
		const point = dwell.pagePoint
			? ` at (${Math.round(dwell.pagePoint.x)}, ${Math.round(dwell.pagePoint.y)})`
			: ''
		lines.push(`- Dwell ${Math.round(dwell.durationMs)}ms on: ${labels || 'empty canvas'}${point}`)
	}
	for (const circle of movement.circledRegions) {
		const labels = circle.labels?.length ? circle.labels.join(', ') : circle.shapeIds.join(', ')
		const { x, y, w, h } = circle.bounds
		lines.push(
			`- Circled (${Math.round(w)}×${Math.round(h)} at ${Math.round(x)},${Math.round(y)}): ${labels || 'empty canvas'}`
		)
	}
	for (const click of movement.clickRegions) {
		const labels = click.labels?.length ? click.labels.join(', ') : click.shapeIds.join(', ')
		const point = click.pagePoint
			? ` at (${Math.round(click.pagePoint.x)}, ${Math.round(click.pagePoint.y)})`
			: ''
		lines.push(`- Clicked at ${Math.round(click.tMs)}ms: ${labels || 'empty canvas'}${point}`)
	}
	return lines.join('\n') || 'No pointer movement recorded during utterance.'
}

/** Word-aligned gesture timeline on the utterance clock (seconds). */
function buildTimelineMarkdown(canvas: CanvasSnapshot): string {
	const events: Array<{ tSec: number; line: string }> = []

	for (const word of canvas.transcriptWords ?? []) {
		const tSec = (word.start + word.end) / 2
		events.push({ tSec, line: `${tSec.toFixed(2)}s — said "${word.word}"` })
	}

	const movement = canvas.movement
	if (movement) {
		for (const click of movement.clickRegions) {
			const tSec = click.tMs / 1000
			const target = click.labels?.length
				? click.labels.join(', ')
				: click.shapeIds.length
					? click.shapeIds.join(', ')
					: 'empty canvas'
			const point = click.pagePoint
				? ` at (${Math.round(click.pagePoint.x)}, ${Math.round(click.pagePoint.y)})`
				: ''
			events.push({ tSec, line: `${tSec.toFixed(2)}s — clicked ${target}${point}` })
		}
		for (const dwell of movement.dwellRegions) {
			const tSec = (dwell.tMsStart + dwell.tMsEnd) / 2000
			const target = dwell.labels?.length
				? dwell.labels.join(', ')
				: dwell.shapeIds.length
					? dwell.shapeIds.join(', ')
					: 'empty canvas'
			events.push({
				tSec,
				line: `${tSec.toFixed(2)}s — dwelled ${Math.round(dwell.durationMs)}ms on ${target}`,
			})
		}
		for (const circle of movement.circledRegions) {
			const tSec = circle.tMsEnd / 1000
			const target = circle.labels?.length
				? circle.labels.join(', ')
				: circle.shapeIds.length
					? circle.shapeIds.join(', ')
					: 'empty region'
			events.push({ tSec, line: `${tSec.toFixed(2)}s — circled ${target}` })
		}
	}

	if (events.length === 0) return 'No word or gesture timings for this request.'

	events.sort((a, b) => a.tSec - b.tSec)
	return [
		'Utterance timeline (seconds from speech start). Words and gestures share this clock.',
		...events.map((event) => `- ${event.line}`),
	].join('\n')
}

function buildSelectionMarkdown(selectionIds: string[], shapes: CanvasSnapshot['shapes']): string {
	if (!selectionIds.length) return 'No shapes selected.'
	const labelById = new Map(shapes.map((s) => [s.shapeId, s.text ?? s.type]))
	return selectionIds
		.map((id) => `- ${id}: ${labelById.get(id) ?? 'unknown'}`)
		.join('\n')
}

function buildViewportMarkdown(bounds: CanvasSnapshot['bounds']): string {
	return [
		'Visible viewport (shape coordinates in shapes.json are relative to this view).',
		`(0,0) is the top-left of what the user sees.`,
		`x=${bounds.x}, y=${bounds.y}, w=${bounds.w}, h=${bounds.h}`,
		'Each shape in shapes.json has x,y,w,h in this frame — use them to avoid stacking on existing boxes.',
	].join('\n')
}

/** Seed Deep Agent StateBackend files from a canvas snapshot. */
export function buildCanvasFiles(canvas: CanvasSnapshot): Record<string, FileData> {
	return {
		'/canvas/viewport.md': makeFile(buildViewportMarkdown(canvas.bounds)),
		'/canvas/shapes.json': makeFile(JSON.stringify(canvas.shapes, null, 2)),
		'/canvas/spacing.md': makeFile(canvas.spacingHints),
		'/canvas/topology.md': makeFile(canvas.topology),
		'/canvas/selection.md': makeFile(buildSelectionMarkdown(canvas.selectionIds, canvas.shapes)),
		'/canvas/deixis.md': makeFile(buildDeixisMarkdown(canvas.deixis)),
		'/canvas/pointer.md': makeFile(buildPointerMarkdown(canvas.movement)),
		'/canvas/timeline.md': makeFile(buildTimelineMarkdown(canvas)),
		'/canvas/request.md': makeFile(canvas.request.trim()),
	}
}
