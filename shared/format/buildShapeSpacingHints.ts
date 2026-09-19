import type { BlurryShape } from './BlurryShape'

const GEO_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'cloud', 'hexagon', 'octagon'])

type Box = { x: number; y: number; w: number; h: number }

function boxesOverlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function overlapArea(a: Box, b: Box): number {
	const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
	const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
	return x * y
}

function gapBetween(a: Box, b: Box): { dx: number; dy: number } {
	const dx =
		a.x + a.w <= b.x
			? b.x - (a.x + a.w)
			: b.x + b.w <= a.x
				? a.x - (b.x + b.w)
				: -Math.min(a.x + a.w - b.x, b.x + b.w - a.x)
	const dy =
		a.y + a.h <= b.y
			? b.y - (a.y + a.h)
			: b.y + b.h <= a.y
				? a.y - (b.y + b.h)
				: -Math.min(a.y + a.h - b.y, b.y + b.h - a.y)
	return { dx, dy }
}

function label(shape: BlurryShape): string {
	return shape.text?.trim() || shape.shapeId
}

/** Markdown hints for the agent: overlaps and tight neighbor gaps. */
export function buildShapeSpacingHints(shapes: BlurryShape[]): string {
	const geo = shapes.filter((s) => GEO_TYPES.has(s.type))
	if (geo.length < 2) return 'No spacing issues detected among geo shapes.'

	const lines: string[] = ['## Spacing analysis (viewport coordinates)']

	const overlaps: string[] = []
	for (let i = 0; i < geo.length; i++) {
		for (let j = i + 1; j < geo.length; j++) {
			const a = geo[i]
			const b = geo[j]
			if (!boxesOverlap(a, b)) continue
			const area = overlapArea(a, b)
			if (area < 4) continue
			overlaps.push(
				`- **${label(a)}** (${a.shapeId}) overlaps **${label(b)}** (${b.shapeId}) — ~${Math.round(area)}px²`
			)
		}
	}

	if (overlaps.length) {
		lines.push('', '### Overlapping pairs', ...overlaps)
	} else {
		lines.push('', 'No overlapping geo boxes detected.')
	}

	const tight: string[] = []
	for (let i = 0; i < geo.length; i++) {
		for (let j = i + 1; j < geo.length; j++) {
			const a = geo[i]
			const b = geo[j]
			const { dx, dy } = gapBetween(a, b)
			if (dx >= 0 && dx < 80 && Math.abs(dy) < Math.max(a.h, b.h)) {
				tight.push(
					`- **${label(a)}** ↔ **${label(b)}**: horizontal gap ${Math.round(dx)}px (target ≥100 for fan-out)`
				)
			}
			if (dy >= 0 && dy < 120 && Math.abs(dx) < Math.max(a.w, b.w)) {
				tight.push(
					`- **${label(a)}** ↔ **${label(b)}**: vertical gap ${Math.round(dy)}px (target ≥140 for stacks)`
				)
			}
		}
	}

	if (tight.length) {
		lines.push('', '### Tight gaps', ...tight.slice(0, 12))
	}

	const xs = geo.map((s) => s.x)
	const ys = geo.map((s) => s.y)
	const maxX = Math.max(...geo.map((s) => s.x + s.w))
	const maxY = Math.max(...geo.map((s) => s.y + s.h))
	lines.push(
		'',
		'### Page extent',
		`- Shapes span x=${Math.round(Math.min(...xs))}…${Math.round(maxX)}, y=${Math.round(Math.min(...ys))}…${Math.round(maxY)}`
	)

	return lines.join('\n')
}
