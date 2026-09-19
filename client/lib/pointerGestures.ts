import { Box, Editor, TLShapeId } from 'tldraw'
import type { CircledRegion, DwellRegion, PointerSample } from './spatialTranscript'

export const TRAIL_WINDOW_MS = 30_000
export const DWELL_MIN_MS = 300
export const DWELL_RADIUS_PX = 28
export const DEIXIS_GESTURE_WINDOW_MS = 500
export const CIRCLE_CLOSURE_PX = 48
export const CIRCLE_MIN_PATH_PX = 120
export const CIRCLE_MIN_AREA_PX2 = 2_500

export function trimSamplesByAge(samples: PointerSample[], cutoffMs: number): PointerSample[] {
	let start = 0
	while (start < samples.length && samples[start].tMs < cutoffMs) {
		start++
	}
	return start === 0 ? samples : samples.slice(start)
}

export function trimRegionsByAge<T extends { tMsEnd: number }>(
	regions: T[],
	cutoffMs: number
): T[] {
	return regions.filter((region) => region.tMsEnd >= cutoffMs)
}

export function sameShapeSet(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	const sortedA = [...a].sort()
	const sortedB = [...b].sort()
	return sortedA.every((id, index) => id === sortedB[index])
}

export function distancePx(
	a: { x: number; y: number },
	b: { x: number; y: number }
): number {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return Math.hypot(dx, dy)
}

export function pathLength(samples: PointerSample[]): number {
	let total = 0
	for (let i = 1; i < samples.length; i++) {
		total += distancePx(samples[i - 1].pagePoint, samples[i].pagePoint)
	}
	return total
}

export function computePathBounds(samples: PointerSample[]): {
	x: number
	y: number
	w: number
	h: number
} | null {
	if (samples.length === 0) return null
	let minX = samples[0].pagePoint.x
	let minY = samples[0].pagePoint.y
	let maxX = minX
	let maxY = minY
	for (const sample of samples) {
		minX = Math.min(minX, sample.pagePoint.x)
		minY = Math.min(minY, sample.pagePoint.y)
		maxX = Math.max(maxX, sample.pagePoint.x)
		maxY = Math.max(maxY, sample.pagePoint.y)
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function getShapeIdsInBounds(
	editor: Editor,
	bounds: { x: number; y: number; w: number; h: number }
): string[] {
	if (bounds.w < 1 || bounds.h < 1) return []
	const box = new Box(bounds.x, bounds.y, bounds.w, bounds.h)
	const ids: string[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		const shapeBounds = editor.getShapePageBounds(shape)
		if (shapeBounds?.collides(box)) {
			ids.push(shape.id as string)
		}
	}
	return ids
}

export type DwellTracker = {
	anchorMs: number
	anchorPoint: { x: number; y: number }
	shapeIds: string[]
	lastEmittedEndMs: number
}

export function createDwellTracker(): DwellTracker {
	return {
		anchorMs: 0,
		anchorPoint: { x: 0, y: 0 },
		shapeIds: [],
		lastEmittedEndMs: -1,
	}
}

export function updateDwellTracker(
	tracker: DwellTracker,
	sample: PointerSample
): DwellRegion | null {
	const { tMs, pagePoint, shapeIds } = sample
	const continuing =
		tracker.anchorMs > 0 &&
		distancePx(pagePoint, tracker.anchorPoint) <= DWELL_RADIUS_PX &&
		sameShapeSet(shapeIds, tracker.shapeIds)

	if (!continuing) {
		tracker.anchorMs = tMs
		tracker.anchorPoint = { ...pagePoint }
		tracker.shapeIds = [...shapeIds]
		return null
	}

	const durationMs = tMs - tracker.anchorMs
	if (durationMs < DWELL_MIN_MS || shapeIds.length === 0) return null
	if (tracker.lastEmittedEndMs >= tMs - 100) return null

	tracker.lastEmittedEndMs = tMs
	return {
		tMsStart: tracker.anchorMs,
		tMsEnd: tMs,
		pagePoint: { ...tracker.anchorPoint },
		shapeIds: [...shapeIds],
		durationMs,
	}
}

export function detectCircledRegion(
	samples: PointerSample[],
	editor: Editor,
	nowMs: number
): CircledRegion | null {
	const recent = samples.filter((sample) => sample.tMs >= nowMs - 2_500)
	if (recent.length < 8) return null

	const totalPath = pathLength(recent)
	if (totalPath < CIRCLE_MIN_PATH_PX) return null

	const first = recent[0]
	const last = recent[recent.length - 1]
	if (distancePx(first.pagePoint, last.pagePoint) > CIRCLE_CLOSURE_PX) return null

	const bounds = computePathBounds(recent)
	if (!bounds || bounds.w * bounds.h < CIRCLE_MIN_AREA_PX2) return null

	const shapeIds = getShapeIdsInBounds(editor, bounds)
	if (shapeIds.length === 0) return null

	return {
		tMsStart: first.tMs,
		tMsEnd: last.tMs,
		bounds,
		shapeIds,
	}
}

export function collectHoveredShapeIds(samples: PointerSample[]): string[] {
	const seen = new Set<string>()
	for (const sample of samples) {
		for (const id of sample.shapeIds) {
			seen.add(id)
		}
	}
	return [...seen]
}

export function findNearestSample(
	samples: PointerSample[],
	tMs: number
): PointerSample | undefined {
	if (samples.length === 0) return undefined
	let best = samples[0]
	let bestDist = Math.abs(samples[0].tMs - tMs)
	for (const sample of samples) {
		const dist = Math.abs(sample.tMs - tMs)
		if (dist < bestDist) {
			bestDist = dist
			best = sample
		}
	}
	return best
}

export function findDwellAtTime(
	regions: DwellRegion[],
	tMs: number,
	windowMs = DEIXIS_GESTURE_WINDOW_MS
): DwellRegion | undefined {
	let best: DwellRegion | undefined
	let bestDist = Infinity
	for (const region of regions) {
		if (tMs < region.tMsStart - windowMs || tMs > region.tMsEnd + windowMs) continue
		const dist =
			tMs < region.tMsStart
				? region.tMsStart - tMs
				: tMs > region.tMsEnd
					? tMs - region.tMsEnd
					: 0
		if (dist < bestDist) {
			bestDist = dist
			best = region
		}
	}
	return best
}

export function findCircleAtTime(
	regions: CircledRegion[],
	tMs: number,
	windowMs = DEIXIS_GESTURE_WINDOW_MS
): CircledRegion | undefined {
	let best: CircledRegion | undefined
	let bestDist = Infinity
	for (const region of regions) {
		const anchor = region.tMsEnd
		const dist = Math.abs(anchor - tMs)
		if (dist > windowMs) continue
		if (dist < bestDist) {
			bestDist = dist
			best = region
		}
	}
	return best
}
