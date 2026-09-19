import { Editor, TLShapeId } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import type { CircledRegion, DwellRegion, PointerSample, TranscriptWord } from './spatialTranscript'
import { toSimpleShapeIds, toTldrawShapeId } from './normalizeShapeId'
import {
	collectHoveredShapeIds,
	computePathBounds,
	extractClickRegions,
	findCircleAtTime,
	findClickAtTime,
	findDwellAtTime,
	findNearestSample,
	getShapeIdsInBounds,
} from './pointerGestures'

const DEICTIC_PATTERN = /^(this|that|these|those|here|it)$/i
const LOCATION_DEICTIC_PATTERN = /^(here|there)$/i

export function isDeicticWord(word: string): boolean {
	const token = word.replace(/^[^\w]+|[^\w]+$/g, '')
	return DEICTIC_PATTERN.test(token)
}

export function isLocationDeictic(word: string): boolean {
	const token = word.replace(/^[^\w]+|[^\w]+$/g, '')
	return LOCATION_DEICTIC_PATTERN.test(token)
}

export type DeixisResolution = {
	refs: SpatialRef[]
	resolvedText: string
	movementContext?: MovementContext
}

/** Rewrite deictic words in place with their grounded referents (GazePointAR pattern). */
function rewriteTranscriptInline(transcript: string, refs: SpatialRef[]): string {
	if (refs.length === 0) return transcript.trim()

	// One annotation per word, first occurrence wins (refs are already deduped by target).
	const byWord = new Map<string, SpatialRef>()
	for (const ref of refs) {
		if (!byWord.has(ref.word)) byWord.set(ref.word, ref)
	}

	const annotated = new Set<string>()
	return transcript
		.split(/(\s+)/)
		.map((piece) => {
			const token = piece.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase()
			const ref = byWord.get(token)
			if (!ref || annotated.has(token)) return piece

			annotated.add(token)
			const target = ref.pagePoint
				? `→ (${Math.round(ref.pagePoint.x)}, ${Math.round(ref.pagePoint.y)})`
				: (ref.labels?.length ? ref.labels.join(' + ') : ref.shapeIds.join(', '))
			return `${piece} [${target}]`
		})
		.join('')
		.trim()
}

type ResolveDeixisInput = {
	transcript: string
	words: TranscriptWord[] | undefined
	samples: PointerSample[]
	dwellRegions: DwellRegion[]
	circledRegions: CircledRegion[]
	recordingDurationMs: number
	editor: Editor
}

export function resolveDeixis({
	transcript,
	words,
	samples,
	dwellRegions,
	circledRegions,
	recordingDurationMs,
	editor,
}: ResolveDeixisInput): DeixisResolution {
	const timedWords =
		words && words.length > 0
			? words
			: estimateWordTimestamps(transcript.split(/\s+/).filter(Boolean), recordingDurationMs)

	const refs: SpatialRef[] = []
	const seen = new Set<string>()

	for (const timedWord of timedWords) {
		const token = timedWord.word.replace(/^[^\w]+|[^\w]+$/g, '')
		if (!DEICTIC_PATTERN.test(token)) continue

		const tMs = ((timedWord.start + timedWord.end) / 2) * 1000
		const shapeIds = resolveShapeIdsAtTime(tMs, samples, dwellRegions, circledRegions, editor)
		const isLocation = LOCATION_DEICTIC_PATTERN.test(token)

		if (shapeIds.length === 0 && !isLocation) continue

		const pagePoint =
			isLocation && shapeIds.length === 0
				? (findClickAtTime(samples, tMs)?.pagePoint ?? findNearestSample(samples, tMs)?.pagePoint)
				: undefined

		if (shapeIds.length === 0 && !pagePoint) continue

		const key = `${token}:${shapeIds.join(',')}:${pagePoint ? `${pagePoint.x},${pagePoint.y}` : ''}`
		if (seen.has(key)) continue
		seen.add(key)

		const simpleIds = toSimpleShapeIds(shapeIds)
		refs.push({
			word: token.toLowerCase(),
			shapeIds: simpleIds,
			labels: simpleIds.map((id) => getShapeLabel(editor, `shape:${id}` as TLShapeId)),
			...(pagePoint ? { pagePoint } : {}),
		})
	}

	const movementContext = buildMovementContext(
		samples,
		dwellRegions,
		circledRegions,
		editor
	)

	return {
		refs,
		resolvedText: rewriteTranscriptInline(transcript, refs),
		movementContext,
	}
}

function resolveShapeIdsAtTime(
	tMs: number,
	samples: PointerSample[],
	dwellRegions: DwellRegion[],
	circledRegions: CircledRegion[],
	editor: Editor
): string[] {
	const click = findClickAtTime(samples, tMs)
	if (click?.shapeIds.length) {
		return click.shapeIds
	}

	const sample = findNearestSample(samples, tMs)
	if (sample?.shapeIds.length) {
		return sample.shapeIds
	}

	const dwell = findDwellAtTime(dwellRegions, tMs)
	if (dwell?.shapeIds.length) {
		return dwell.shapeIds
	}

	const circle = findCircleAtTime(circledRegions, tMs)
	if (circle?.shapeIds.length) {
		return circle.shapeIds
	}

	const recent = samples.filter((entry) => Math.abs(entry.tMs - tMs) <= 500)
	if (recent.length >= 3) {
		const bounds = computePathBounds(recent)
		if (bounds) {
			const trailShapeIds = getShapeIdsInBounds(editor, bounds)
			if (trailShapeIds.length > 0) return trailShapeIds
		}
	}

	return []
}

function buildMovementContext(
	samples: PointerSample[],
	dwellRegions: DwellRegion[],
	circledRegions: CircledRegion[],
	editor: Editor
): MovementContext | undefined {
	const hoveredShapeIds = toSimpleShapeIds(collectHoveredShapeIds(samples))
	const dwellPayload = dwellRegions.map((region) => {
		const shapeIds = toSimpleShapeIds(region.shapeIds)
		return {
			tMsStart: region.tMsStart,
			tMsEnd: region.tMsEnd,
			durationMs: region.durationMs,
			shapeIds,
			labels: shapeIds.map((id) => getShapeLabel(editor, `shape:${id}` as TLShapeId)),
			pagePoint: region.pagePoint,
		}
	})
	const circlePayload = circledRegions.map((region) => {
		const shapeIds = toSimpleShapeIds(region.shapeIds)
		return {
			tMsStart: region.tMsStart,
			tMsEnd: region.tMsEnd,
			bounds: region.bounds,
			shapeIds,
			labels: shapeIds.map((id) => getShapeLabel(editor, `shape:${id}` as TLShapeId)),
		}
	})
	const clickPayload = extractClickRegions(samples).map((region) => {
		const shapeIds = toSimpleShapeIds(region.shapeIds)
		return {
			tMs: region.tMs,
			shapeIds,
			labels: shapeIds.map((id) => getShapeLabel(editor, `shape:${id}` as TLShapeId)),
			pagePoint: region.pagePoint,
		}
	})

	if (
		hoveredShapeIds.length === 0 &&
		dwellPayload.length === 0 &&
		circlePayload.length === 0 &&
		clickPayload.length === 0
	) {
		return undefined
	}

	return {
		hoveredShapeIds,
		dwellRegions: dwellPayload,
		circledRegions: circlePayload,
		clickRegions: clickPayload,
	}
}

function estimateWordTimestamps(tokens: string[], durationMs: number): TranscriptWord[] {
	if (tokens.length === 0) return []
	const msPerWord = durationMs / tokens.length
	return tokens.map((word, index) => ({
		word,
		start: (index * msPerWord) / 1000,
		end: ((index + 1) * msPerWord) / 1000,
	}))
}

export function getShapeLabel(editor: Editor, shapeId: string): string {
	const shape = editor.getShape(shapeId as TLShapeId)
	if (!shape) return shapeId

	try {
		const util = editor.getShapeUtil(shape)
		if ('getText' in util && typeof util.getText === 'function') {
			const text = util.getText(shape)
			if (typeof text === 'string' && text.trim()) return text.trim()
		}
	} catch {
		// fall through
	}

	if ('richText' in shape.props) {
		const richText = shape.props.richText as { content?: Array<{ content?: Array<{ text?: string }> }> }
		const text = richText?.content?.[0]?.content?.[0]?.text
		if (text?.trim()) return text.trim()
	}

	return shapeId
}

export function flashResolvedShapes(editor: Editor, refs: SpatialRef[], durationMs = 1200): void {
	// refs carry simple IDs — setHintingShapes requires full tldraw shape IDs.
	// A validation failure here crashes the editor (which disposes the agent app and
	// blanks the page), so never let it throw.
	try {
		const shapeIds = [...new Set(refs.flatMap((ref) => ref.shapeIds))].map(toTldrawShapeId)
		if (shapeIds.length === 0) return
		editor.setHintingShapes(shapeIds)
		window.setTimeout(() => {
			try {
				editor.setHintingShapes([])
			} catch {
				// editor may be gone
			}
		}, durationMs)
	} catch {
		// hinting is cosmetic — never crash the editor over it
	}
}
