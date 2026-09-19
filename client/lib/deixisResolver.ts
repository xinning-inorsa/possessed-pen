import { Editor, TLShapeId } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import type { CircledRegion, DwellRegion, PointerSample, TranscriptWord } from './spatialTranscript'
import {
	collectHoveredShapeIds,
	computePathBounds,
	findCircleAtTime,
	findDwellAtTime,
	findNearestSample,
	getShapeIdsInBounds,
} from './pointerGestures'

const DEICTIC_PATTERN = /^(this|that|these|those|here|it)$/i

export function isDeicticWord(word: string): boolean {
	const token = word.replace(/^[^\w]+|[^\w]+$/g, '')
	return DEICTIC_PATTERN.test(token)
}

export type DeixisResolution = {
	refs: SpatialRef[]
	resolvedText: string
	movementContext?: MovementContext
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
		if (shapeIds.length === 0) continue

		const key = `${token}:${shapeIds.join(',')}`
		if (seen.has(key)) continue
		seen.add(key)

		refs.push({
			word: token.toLowerCase(),
			shapeIds,
			labels: shapeIds.map((id) => getShapeLabel(editor, id)),
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
		resolvedText: transcript.trim(),
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
	const hoveredShapeIds = collectHoveredShapeIds(samples)
	const dwellPayload = dwellRegions.map((region) => ({
		tMsStart: region.tMsStart,
		tMsEnd: region.tMsEnd,
		durationMs: region.durationMs,
		shapeIds: region.shapeIds,
		labels: region.shapeIds.map((id) => getShapeLabel(editor, id)),
	}))
	const circlePayload = circledRegions.map((region) => ({
		tMsStart: region.tMsStart,
		tMsEnd: region.tMsEnd,
		bounds: region.bounds,
		shapeIds: region.shapeIds,
		labels: region.shapeIds.map((id) => getShapeLabel(editor, id)),
	}))

	if (
		hoveredShapeIds.length === 0 &&
		dwellPayload.length === 0 &&
		circlePayload.length === 0
	) {
		return undefined
	}

	return {
		hoveredShapeIds,
		dwellRegions: dwellPayload,
		circledRegions: circlePayload,
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
	const shapeIds = [...new Set(refs.flatMap((ref) => ref.shapeIds))] as TLShapeId[]
	if (shapeIds.length === 0) return
	editor.setHintingShapes(shapeIds)
	window.setTimeout(() => editor.setHintingShapes([]), durationMs)
}
