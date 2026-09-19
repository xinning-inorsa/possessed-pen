import { Editor } from '@tldraw/editor'
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
	type TransitionEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { getShapeLabel, isDeicticWord } from '../lib/deixisResolver'
import { useInspectableSession } from '../hooks/useInspectableSession'
import { popupClassName, usePopupPresence } from '../hooks/usePopupPresence'
import {
	getSessionDurationMs,
	type AudioEnvelopeSample,
	type PointerSample,
	type SessionUtterance,
	type SpatialTranscriptSession,
} from '../lib/spatialTranscript'
import type { TranscriptWord } from '../../shared/types/TranscriptWord'

function formatMs(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000))
	const min = Math.floor(totalSec / 60)
	const sec = totalSec % 60
	return `${min}:${sec.toString().padStart(2, '0')}`
}

function getUtteranceWords(utterance: SessionUtterance): TranscriptWord[] {
	if (utterance.words && utterance.words.length > 0) return utterance.words
	const tokens = utterance.transcript.split(/\s+/).filter(Boolean)
	const durationMs = utterance.tMsEnd - utterance.tMsStart
	if (tokens.length === 0) return []
	const msPerWord = durationMs / tokens.length
	return tokens.map((word, index) => ({
		word,
		start: (index * msPerWord) / 1000,
		end: ((index + 1) * msPerWord) / 1000,
	}))
}

function findRefForWord(utterance: SessionUtterance, word: string) {
	if (!utterance.refs?.length) return undefined
	const token = word.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase()
	return utterance.refs.find((ref) => ref.word === token)
}

function getPointerAtTime(samples: PointerSample[], tMs: number): PointerSample | null {
	if (samples.length === 0) return null
	if (tMs <= samples[0].tMs) return samples[0]
	if (tMs >= samples[samples.length - 1].tMs) return samples[samples.length - 1]

	let before = samples[0]
	for (const sample of samples) {
		if (sample.tMs <= tMs) before = sample
		else break
	}

	const after = samples.find((sample) => sample.tMs > tMs)
	if (!after || after.tMs === before.tMs) return before

	const ratio = (tMs - before.tMs) / (after.tMs - before.tMs)
	return {
		...before,
		tMs,
		pagePoint: {
			x: before.pagePoint.x + (after.pagePoint.x - before.pagePoint.x) * ratio,
			y: before.pagePoint.y + (after.pagePoint.y - before.pagePoint.y) * ratio,
		},
		screenPoint:
			before.screenPoint && after.screenPoint
				? {
						x: before.screenPoint.x + (after.screenPoint.x - before.screenPoint.x) * ratio,
						y: before.screenPoint.y + (after.screenPoint.y - before.screenPoint.y) * ratio,
					}
				: before.screenPoint,
	}
}

function buildTrailPoints(
	samples: PointerSample[],
	durationMs: number,
	maxMs?: number
): string {
	if (durationMs <= 0 || samples.length === 0) return ''
	const moves = samples.filter((s) => s.eventType === 'move')
	const list = moves.length > 1 ? moves : samples
	const filtered = maxMs != null ? list.filter((s) => s.tMs <= maxMs) : list
	if (filtered.length === 0) return ''
	return filtered
		.map((sample) => {
			const x = (sample.tMs / durationMs) * 100
			const y = list.length > 1 ? 20 + (sample.pagePoint.y % 60) : 50
			return `${x},${y}`
		})
		.join(' ')
}

function trailYPercent(pageY: number, hasMultiMove: boolean): number {
	return hasMultiMove ? 20 + (pageY % 60) : 50
}

function buildWaveformPoints(
	samples: AudioEnvelopeSample[],
	durationMs: number,
	maxMs?: number
): string {
	if (durationMs <= 0 || samples.length === 0) return ''
	const list = maxMs != null ? samples.filter((s) => s.tMs <= maxMs) : samples
	if (list.length === 0) return ''
	return list
		.flatMap((sample) => {
			const x = (sample.tMs / durationMs) * 100
			const amp = Math.max(1.5, Math.min(1, sample.rms) * 42)
			return [`${x},${50 - amp}`, `${x},${50 + amp}`]
		})
		.join(' ')
}

function wordTimeMs(value: number): number {
	return value > 1000 ? value : value * 1000
}

function findActiveWordIndex(utterance: SessionUtterance, playheadMs: number): number {
	const words = getUtteranceWords(utterance)
	if (words.length === 0) return -1
	const t = playheadMs - utterance.tMsStart
	let best = 0
	for (let i = 0; i < words.length; i++) {
		const start = wordTimeMs(words[i].start)
		const end = Math.max(start, wordTimeMs(words[i].end))
		if (t >= start && t < end) return i
		if (start <= t) best = i
	}
	return t < wordTimeMs(words[0].start) ? 0 : best
}

const KARAOKE_LINE = 6

function karaokeLineStart(activeIndex: number, wordCount: number): number {
	if (activeIndex < 0 || wordCount === 0) return 0
	return Math.min(
		Math.floor(activeIndex / KARAOKE_LINE) * KARAOKE_LINE,
		Math.max(0, wordCount - KARAOKE_LINE)
	)
}

function karaokeChipStyle(playheadPct: number): { left: string; width: string; transform: string } {
	const width = 46
	if (playheadPct <= width / 2) {
		return { left: '0%', width: `${width}%`, transform: 'translateY(-50%)' }
	}
	if (playheadPct >= 100 - width / 2) {
		return { left: `${100 - width}%`, width: `${width}%`, transform: 'translateY(-50%)' }
	}
	return {
		left: `${playheadPct}%`,
		width: `${width}%`,
		transform: 'translate(-50%, -50%)',
	}
}

async function envelopeFromAudioUrl(
	url: string,
	tMsStart: number,
	tMsEnd: number
): Promise<AudioEnvelopeSample[]> {
	const buffer = await (await fetch(url)).arrayBuffer()
	const copy = buffer.slice(0)
	const ctx = new OfflineAudioContext(1, 1, 16000)
	const audio = await ctx.decodeAudioData(copy)
	const data = audio.getChannelData(0)
	const dur = Math.max(1, tMsEnd - tMsStart)
	const count = Math.min(160, Math.max(24, Math.round(dur / 50)))
	const bucketSize = Math.max(1, Math.floor(data.length / count))
	const samples: AudioEnvelopeSample[] = []
	for (let i = 0; i < count; i++) {
		let peak = 0
		const start = i * bucketSize
		const end = Math.min(data.length, start + bucketSize)
		for (let j = start; j < end; j++) {
			const v = Math.abs(data[j] ?? 0)
			if (v > peak) peak = v
		}
		samples.push({
			tMs: tMsStart + (i / count) * dur,
			rms: Math.min(1, peak * 2.4),
		})
	}
	return samples
}

function findUtteranceAtTime(
	utterances: SessionUtterance[],
	tMs: number
): SessionUtterance | undefined {
	return utterances.find(
		(utterance) =>
			utterance.audioBlobUrl && tMs >= utterance.tMsStart && tMs < utterance.tMsEnd
	)
}

type InspectTimelineProps = {
	editor: Editor
}

export function InspectTimeline({ editor }: InspectTimelineProps) {
	const { session, live } = useInspectableSession()
	const [expanded, setExpanded] = useState(false)
	const [playheadMs, setPlayheadMs] = useState(0)
	const [isReplaying, setIsReplaying] = useState(false)
	const [showPayload, setShowPayload] = useState(false)
	const [hoverPointer, setHoverPointer] = useState<{
		tMs: number
		labels: string[]
	} | null>(null)
	const panelRef = useRef<HTMLElement>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const playingUtteranceRef = useRef<string | null>(null)
	const replayAudioRef = useRef(false)
	const replayAnchorWallMs = useRef(0)
	const replayAnchorPlayheadMs = useRef(0)
	const replayRafRef = useRef<number | null>(null)
	const [decodedEnvelope, setDecodedEnvelope] = useState<AudioEnvelopeSample[]>([])
	const [liveTick, setLiveTick] = useState(0)

	const isLive = Boolean(session && !session.endedAt)

	useEffect(() => {
		if (!isLive) return
		const id = window.setInterval(() => setLiveTick((t) => t + 1), 250)
		return () => window.clearInterval(id)
	}, [isLive, session?.id])

	const durationMs = useMemo(
		() => (session ? getSessionDurationMs(session) : 0),
		[session, liveTick]
	)
	const canReplay = Boolean(session?.endedAt && durationMs > 0)
	const utteranceCount = session?.utterances.length ?? 0
	const moveCount = session?.pointerSamples.filter((s) => s.eventType === 'move').length ?? 0
	const pointerCount = session?.pointerSamples.length ?? 0

	const collapse = useCallback(() => setExpanded(false), [])
	const expand = useCallback(() => setExpanded(true), [])

	const stopReplay = useCallback(() => {
		if (replayRafRef.current != null) {
			cancelAnimationFrame(replayRafRef.current)
			replayRafRef.current = null
		}
		setIsReplaying(false)
		if (replayAudioRef.current) {
			audioRef.current?.pause()
			playingUtteranceRef.current = null
			replayAudioRef.current = false
		}
	}, [])

	useEffect(() => {
		setPlayheadMs(0)
		stopReplay()
	}, [session?.id, stopReplay])

	useEffect(() => {
		if (!expanded) stopReplay()
	}, [expanded, stopReplay])

	useEffect(() => {
		if (!expanded) return

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') collapse()
		}

		const onPointerDown = (e: PointerEvent) => {
			if (panelRef.current?.contains(e.target as Node)) return
			collapse()
		}

		document.addEventListener('keydown', onKeyDown)
		const id = window.setTimeout(() => {
			document.addEventListener('pointerdown', onPointerDown)
		}, 0)

		return () => {
			clearTimeout(id)
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('pointerdown', onPointerDown)
		}
	}, [expanded, collapse])

	useEffect(() => {
		return () => {
			if (replayRafRef.current != null) cancelAnimationFrame(replayRafRef.current)
			audioRef.current?.pause()
			audioRef.current = null
		}
	}, [])

	const syncReplayAudio = useCallback(
		(tMs: number) => {
			if (!session) return

			const utterance = findUtteranceAtTime(session.utterances, tMs)
			if (!utterance?.audioBlobUrl) {
				if (replayAudioRef.current) {
					audioRef.current?.pause()
					playingUtteranceRef.current = null
					replayAudioRef.current = false
				}
				return
			}

			const targetSec = (tMs - utterance.tMsStart) / 1000
			if (playingUtteranceRef.current === utterance.id && audioRef.current) {
				if (Math.abs(audioRef.current.currentTime - targetSec) > 0.3) {
					audioRef.current.currentTime = targetSec
				}
				if (audioRef.current.paused) void audioRef.current.play()
				return
			}

			audioRef.current?.pause()
			const audio = new Audio(utterance.audioBlobUrl)
			audioRef.current = audio
			playingUtteranceRef.current = utterance.id
			replayAudioRef.current = true
			audio.currentTime = targetSec
			void audio.play()
		},
		[session]
	)

	const scrubTo = useCallback(
		(clientX: number, tracksEl: HTMLElement) => {
			if (durationMs <= 0) return
			stopReplay()
			const lane = tracksEl.querySelector<HTMLElement>('.pp-inspect-timeline__track-lane')
			const rect = (lane ?? tracksEl).getBoundingClientRect()
			if (rect.width <= 0) return
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
			setPlayheadMs(ratio * durationMs)
		},
		[durationMs, stopReplay]
	)

	const playUtterance = useCallback(
		(utterance: SessionUtterance) => {
			if (!utterance.audioBlobUrl) return

			stopReplay()
			replayAudioRef.current = false
			audioRef.current?.pause()

			const audio = new Audio(utterance.audioBlobUrl)
			audioRef.current = audio
			playingUtteranceRef.current = utterance.id

			const onTimeUpdate = () => {
				setPlayheadMs(utterance.tMsStart + audio.currentTime * 1000)
			}
			const onEnded = () => {
				audio.removeEventListener('timeupdate', onTimeUpdate)
				audio.removeEventListener('ended', onEnded)
				if (playingUtteranceRef.current === utterance.id) {
					playingUtteranceRef.current = null
				}
			}

			audio.addEventListener('timeupdate', onTimeUpdate)
			audio.addEventListener('ended', onEnded)
			setPlayheadMs(utterance.tMsStart)
			void audio.play()
		},
		[stopReplay]
	)

	const toggleReplay = useCallback(() => {
		if (!canReplay) return

		if (isReplaying) {
			stopReplay()
			return
		}

		const startMs = playheadMs >= durationMs - 30 ? 0 : playheadMs
		replayAnchorPlayheadMs.current = startMs
		replayAnchorWallMs.current = performance.now()
		setPlayheadMs(startMs)
		setIsReplaying(true)
	}, [canReplay, durationMs, isReplaying, playheadMs, stopReplay])

	useEffect(() => {
		if (!isReplaying || !session || durationMs <= 0) return

		const tick = () => {
			const elapsed = performance.now() - replayAnchorWallMs.current
			const nextMs = Math.min(replayAnchorPlayheadMs.current + elapsed, durationMs)
			setPlayheadMs(nextMs)
			syncReplayAudio(nextMs)

			if (nextMs >= durationMs) {
				stopReplay()
				return
			}

			replayRafRef.current = requestAnimationFrame(tick)
		}

		replayRafRef.current = requestAnimationFrame(tick)
		return () => {
			if (replayRafRef.current != null) {
				cancelAnimationFrame(replayRafRef.current)
				replayRafRef.current = null
			}
		}
	}, [durationMs, isReplaying, session, stopReplay, syncReplayAudio])

	const payloadPreview = useMemo(() => {
		if (!session?.utterances.length) return null
		const latest = session.utterances[session.utterances.length - 1]
		return (
			latest.llmPayload ?? {
				prompt: latest.transcript,
				refs: latest.refs,
				movementContext: undefined,
			}
		)
	}, [session])

	const pointerMoves = useMemo(() => {
		if (!session?.pointerSamples.length) return []
		const moves = session.pointerSamples.filter((s) => s.eventType === 'move')
		return moves.length > 1 ? moves : session.pointerSamples
	}, [session?.pointerSamples])

	const pointerTrail = useMemo(
		() =>
			session?.pointerSamples.length
				? buildTrailPoints(session.pointerSamples, durationMs)
				: '',
		[durationMs, session?.pointerSamples]
	)

	const pointerTrailPast = useMemo(
		() =>
			isReplaying && session?.pointerSamples.length
				? buildTrailPoints(session.pointerSamples, durationMs, playheadMs)
				: '',
		[durationMs, isReplaying, playheadMs, session?.pointerSamples]
	)

	const recordedEnvelope = session?.audioEnvelope ?? []
	const blobKey = session?.utterances.map((u) => `${u.id}:${u.audioBlobUrl ?? ''}`).join('|') ?? ''

	useEffect(() => {
		if (!session || recordedEnvelope.length > 1) {
			setDecodedEnvelope((prev) => (prev.length === 0 ? prev : []))
			return
		}
		const withBlobs = session.utterances.filter((u) => u.audioBlobUrl)
		if (withBlobs.length === 0) {
			setDecodedEnvelope((prev) => (prev.length === 0 ? prev : []))
			return
		}

		let cancelled = false
		void (async () => {
			const samples: AudioEnvelopeSample[] = []
			for (const utterance of withBlobs) {
				try {
					samples.push(
						...(await envelopeFromAudioUrl(
							utterance.audioBlobUrl!,
							utterance.tMsStart,
							utterance.tMsEnd
						))
					)
				} catch {
					// Blob may have been revoked or be an unsupported codec.
				}
			}
			if (!cancelled) setDecodedEnvelope(samples)
		})()

		return () => {
			cancelled = true
		}
	}, [blobKey, recordedEnvelope.length, session])

	const audioEnvelope = recordedEnvelope.length > 1 ? recordedEnvelope : decodedEnvelope

	const audioTrail = useMemo(
		() => (audioEnvelope.length > 0 ? buildWaveformPoints(audioEnvelope, durationMs) : ''),
		[audioEnvelope, audioEnvelope.length, durationMs, liveTick]
	)

	const audioTrailPast = useMemo(
		() =>
			isReplaying && audioEnvelope.length > 0
				? buildWaveformPoints(audioEnvelope, durationMs, playheadMs)
				: '',
		[audioEnvelope, audioEnvelope.length, durationMs, isReplaying, playheadMs]
	)

	const replayPointer = useMemo(() => {
		if (!isReplaying || !session?.pointerSamples.length) return null
		return getPointerAtTime(session.pointerSamples, playheadMs)
	}, [isReplaying, playheadMs, session?.pointerSamples])

	const replayPointerLabels = useMemo(() => {
		if (!replayPointer) return []
		const shapeIds =
			replayPointer.shapeIds.length > 0
				? replayPointer.shapeIds
				: replayPointer.selectedShapeIds
		return shapeIds.map((id) => getShapeLabel(editor, id))
	}, [editor, replayPointer])

	const pendingAudioEndMs = live.isListening ? durationMs : undefined

	const panel = usePopupPresence(expanded)
	const payload = usePopupPresence(showPayload && payloadPreview != null)
	const hoverTip = usePopupPresence(hoverPointer != null)
	const replayTip = usePopupPresence(
		Boolean(isReplaying && replayPointer && replayPointerLabels.length > 0)
	)
	const replayCursor = usePopupPresence(Boolean(isReplaying && replayPointer))

	const hoverTipRef = useRef(hoverPointer)
	if (hoverPointer) hoverTipRef.current = hoverPointer
	const replayPointerRef = useRef(replayPointer)
	if (replayPointer) replayPointerRef.current = replayPointer
	const replayLabelsRef = useRef(replayPointerLabels)
	if (replayPointerLabels.length > 0) replayLabelsRef.current = replayPointerLabels
	const payloadRef = useRef(payloadPreview)
	if (payloadPreview) payloadRef.current = payloadPreview

	if (!session) return null

	const chipDetail =
		utteranceCount > 0
			? `${utteranceCount} utterance${utteranceCount === 1 ? '' : 's'}`
			: pointerCount > 0
				? `${moveCount} moves`
				: isLive
					? 'live'
					: 'empty'

	const hasAudioData =
		audioEnvelope.length > 0 ||
		session.utterances.length > 0 ||
		Boolean(audioTrail) ||
		live.isListening
	const hasTranscriptData =
		session.utterances.some((u) => u.transcript.trim().length > 0) ||
		live.isTranscribing ||
		Boolean(live.pendingTranscript)
	const hasPointerData = pointerCount > 0
	const hoverTipData = hoverPointer ?? hoverTipRef.current
	const replayCursorPointer = replayPointer ?? replayPointerRef.current
	const payloadData = payloadPreview ?? payloadRef.current

	return (
		<>
			{!expanded && !panel.mounted && (
				<button
					type="button"
					className="pp-inspect-timeline__chip pp-glass"
					onClick={expand}
					aria-expanded={false}
					aria-controls="pp-inspect-timeline-panel"
					aria-label={`Inspect, ${chipDetail}. Expand.`}
				>
					<span className="pp-inspect-timeline__chip-icon" aria-hidden>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
							<circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.25" />
							<path d="M6 3.5v2.5l1.75 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
						</svg>
					</span>
					<span className="pp-inspect-timeline__chip-label">Inspect</span>
					<span className="pp-inspect-timeline__chip-count">
						{utteranceCount > 0 ? utteranceCount : pointerCount > 0 ? moveCount : isLive ? '●' : '0'}
					</span>
				</button>
			)}
			{panel.mounted && (
		<aside
			ref={panelRef}
			id="pp-inspect-timeline-panel"
			className={popupClassName(
				panel.open,
				'pp-inspect-timeline',
				'pp-inspect-timeline--expanded',
				'pp-glass',
				'pp-glass--panel'
			)}
			aria-label="Call inspect timeline"
			aria-hidden={!panel.open}
			onTransitionEnd={panel.onTransitionEnd}
		>
			<div className="pp-inspect-timeline__header">
				<span className="pp-inspect-timeline__title">Inspect</span>
				<span className="pp-inspect-timeline__meta">
					{formatMs(durationMs)}
					{activeLabel(session)}
				</span>
				<button
					type="button"
					className={
						'pp-inspect-timeline__replay-btn' +
						(isReplaying ? ' pp-inspect-timeline__replay-btn--active' : '')
					}
					onClick={toggleReplay}
					aria-pressed={isReplaying}
					disabled={!canReplay}
					title={canReplay ? (isReplaying ? 'Pause replay' : 'Replay call') : 'Replay after call ends'}
				>
					{isReplaying ? 'Pause' : 'Replay'}
				</button>
				<button
					type="button"
					className="pp-inspect-timeline__payload-toggle"
					onClick={() => setShowPayload((v) => !v)}
					aria-pressed={showPayload}
					disabled={!payloadPreview}
				>
					LLM
				</button>
				<button
					type="button"
					className="pp-inspect-timeline__collapse"
					onClick={collapse}
					aria-expanded={true}
					aria-controls="pp-inspect-timeline-panel"
					aria-label="Collapse inspect"
				>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
						<path
							d="M2 2l6 6M8 2L2 8"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div
				className="pp-inspect-timeline__tracks"
				onPointerDown={(e) => scrubTo(e.clientX, e.currentTarget)}
			>
				{durationMs > 0 && (
					<div className="pp-inspect-timeline__playhead-rail">
						<Playhead playheadMs={playheadMs} durationMs={durationMs} />
					</div>
				)}

				<Track
					label="Audio"
					badge={live.isListening ? 'recording' : undefined}
					empty={
						!hasAudioData
							? isLive
								? 'Speak to record audio'
								: 'Start a call and speak to populate'
							: undefined
					}
				>
					{audioTrail && (
						<svg
							className="pp-inspect-timeline__pointer-trail"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							aria-hidden
						>
							<polyline
								className={
									isReplaying ? 'pp-inspect-timeline__pointer-trail-line--future' : undefined
								}
								points={audioTrail}
								vectorEffect="non-scaling-stroke"
							/>
							{audioTrailPast && (
								<polyline
									className="pp-inspect-timeline__pointer-trail-line--past"
									points={audioTrailPast}
									vectorEffect="non-scaling-stroke"
								/>
							)}
						</svg>
					)}
					{session.utterances.map((utterance) => (
						<button
							key={utterance.id}
							type="button"
							className="pp-inspect-timeline__audio-seg"
							style={segmentStyle(utterance.tMsStart, utterance.tMsEnd, durationMs)}
							title={`Play utterance (${formatMs(utterance.tMsEnd - utterance.tMsStart)})`}
							onClick={(e) => {
								e.stopPropagation()
								playUtterance(utterance)
							}}
							disabled={!utterance.audioBlobUrl}
						/>
					))}
					{live.isListening && live.pendingUtteranceStartMs != null && pendingAudioEndMs != null && (
						<span
							className="pp-inspect-timeline__audio-seg pp-inspect-timeline__audio-seg--recording"
							style={segmentStyle(live.pendingUtteranceStartMs, pendingAudioEndMs, durationMs)}
							title="Recording…"
						/>
					)}
				</Track>

				<Track
					label="Pointer"
					badge={pointerCount > 0 ? `${moveCount} moves` : undefined}
					empty={
						!hasPointerData
							? isLive
								? 'Move cursor on canvas'
								: 'Start a call and move the cursor'
							: undefined
					}
				>
					{pointerTrail && (
						<svg
							className="pp-inspect-timeline__pointer-trail"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							aria-hidden
						>
							<polyline
								className={
									isReplaying ? 'pp-inspect-timeline__pointer-trail-line--future' : undefined
								}
								points={pointerTrail}
								vectorEffect="non-scaling-stroke"
							/>
							{pointerTrailPast && (
								<polyline
									className="pp-inspect-timeline__pointer-trail-line--past"
									points={pointerTrailPast}
									vectorEffect="non-scaling-stroke"
								/>
							)}
						</svg>
					)}
					{isReplaying && replayPointer && (
						<span
							className="pp-inspect-timeline__replay-ghost"
							style={{
								left: `${(playheadMs / durationMs) * 100}%`,
								top: `${trailYPercent(replayPointer.pagePoint.y, pointerMoves.length > 1)}%`,
							}}
							aria-hidden
						/>
					)}
					{replayTip.mounted && replayLabelsRef.current.length > 0 && (
						<span
							className={popupClassName(
								replayTip.open,
								'pp-inspect-timeline__pointer-tip',
								'pp-inspect-timeline__pointer-tip--replay'
							)}
							style={{ left: `${(playheadMs / durationMs) * 100}%` }}
							onTransitionEnd={replayTip.onTransitionEnd}
						>
							{(replayPointerLabels.length > 0
								? replayPointerLabels
								: replayLabelsRef.current
							).join(', ')}
						</span>
					)}
					{session.dwellRegions.map((region, index) => (
						<span
							key={`dwell-${region.tMsStart}-${index}`}
							className="pp-inspect-timeline__dwell-region"
							style={segmentStyle(region.tMsStart, region.tMsEnd, durationMs)}
							title={`Dwell ${Math.round(region.durationMs)}ms · ${region.shapeIds.length} shape(s)`}
						/>
					))}
					{session.circledRegions.map((region, index) => (
						<span
							key={`circle-${region.tMsStart}-${index}`}
							className="pp-inspect-timeline__circled-region"
							style={segmentStyle(region.tMsStart, region.tMsEnd, durationMs)}
							title={`Circled region · ${region.shapeIds.length} shape(s)`}
						/>
					))}
					{session.pointerSamples
						.filter((sample) => sample.eventType !== 'move')
						.map((sample, index) => {
							const shapeIds =
								sample.shapeIds.length > 0 ? sample.shapeIds : sample.selectedShapeIds
							const labels = shapeIds.map((id) => getShapeLabel(editor, id))
							return (
								<button
									key={`${sample.tMs}-${sample.eventType}-${index}`}
									type="button"
									className={
										'pp-inspect-timeline__pointer-dot' +
										(sample.eventType === 'down'
											? ' pp-inspect-timeline__pointer-dot--down'
											: ' pp-inspect-timeline__pointer-dot--up')
									}
									style={{ left: `${(sample.tMs / durationMs) * 100}%` }}
									title={
										labels.length
											? `${sample.eventType}: ${labels.join(', ')}`
											: `${sample.eventType}: no shape`
									}
									onPointerEnter={() =>
										setHoverPointer({
											tMs: sample.tMs,
											labels: labels.length ? labels : [`${sample.eventType} · (none)`],
										})
									}
									onPointerLeave={() => setHoverPointer(null)}
									onClick={(e) => {
										e.stopPropagation()
										setPlayheadMs(sample.tMs)
									}}
								/>
							)
						})}
					{hoverTip.mounted && hoverTipData && (
						<span
							className={popupClassName(hoverTip.open, 'pp-inspect-timeline__pointer-tip')}
							style={{ left: `${(hoverTipData.tMs / durationMs) * 100}%` }}
							onTransitionEnd={hoverTip.onTransitionEnd}
						>
							{hoverTipData.labels.join(', ')}
						</span>
					)}
				</Track>

				<Track
					label="Transcript"
					clip
					empty={
						!hasTranscriptData
							? isLive
								? live.isListening
									? 'Listening…'
									: 'Speak to see words'
								: 'Start a call and speak to populate'
							: undefined
					}
				>
					{session.utterances.map((utterance) => {
						if (!utterance.transcript.trim()) return null
						const words = getUtteranceWords(utterance)
						const isActiveUtterance =
							playheadMs >= utterance.tMsStart && playheadMs <= utterance.tMsEnd
						if (!isActiveUtterance && session.utterances.length > 1) return null
						const activeIndex = findActiveWordIndex(utterance, isActiveUtterance ? playheadMs : utterance.tMsStart)
						const lineStart = karaokeLineStart(activeIndex, words.length)
						const lineWords = words.slice(lineStart, lineStart + KARAOKE_LINE)
						const playheadPct =
							durationMs > 0
								? (Math.min(Math.max(playheadMs, utterance.tMsStart), utterance.tMsEnd) /
										durationMs) *
									100
								: 0
						return (
							<span
								key={utterance.id}
								className={
									'pp-inspect-timeline__utterance' +
									(isActiveUtterance ? ' pp-inspect-timeline__utterance--active' : '')
								}
								style={karaokeChipStyle(playheadPct)}
								title={utterance.transcript}
							>
								<span
									key={`${utterance.id}-${lineStart}`}
									className="pp-inspect-timeline__karaoke-line"
								>
									{lineWords.map((word, offset) => {
										const index = lineStart + offset
										const ref = isDeicticWord(word.word)
											? findRefForWord(utterance, word.word)
											: undefined
										const isActive = isActiveUtterance && activeIndex === index
										const isPast = isActiveUtterance && index < activeIndex
										return (
											<span
												key={`${utterance.id}-${index}`}
												className={
													'pp-inspect-timeline__word' +
													(ref ? ' pp-inspect-timeline__word--deictic' : '') +
													(isActive ? ' pp-inspect-timeline__word--active' : '') +
													(isPast ? ' pp-inspect-timeline__word--past' : '')
												}
												title={
													ref
														? `${word.word} → ${(ref.labels ?? ref.shapeIds).join(', ')}`
														: word.word
												}
											>
												{word.word}
											</span>
										)
									})}
								</span>
							</span>
						)
					})}
					{live.isTranscribing && (
						<span
							className="pp-inspect-timeline__utterance pp-inspect-timeline__utterance--pending"
							style={{
								left: `${
									durationMs > 0
										? Math.min(
												((live.pendingUtteranceStartMs ?? playheadMs) / durationMs) * 100,
												76
											)
										: 0
								}%`,
								width: '24%',
							}}
						>
							<span className="pp-inspect-timeline__word pp-inspect-timeline__word--pending">
								Transcribing…
							</span>
						</span>
					)}
					{live.pendingTranscript &&
						!live.isTranscribing &&
						!session.utterances.some((u) => u.transcript === live.pendingTranscript) && (
							<span
								className="pp-inspect-timeline__utterance pp-inspect-timeline__utterance--pending"
								style={{ left: 0, width: '100%' }}
								title={live.pendingTranscript}
							>
								{live.pendingTranscript.split(/\s+/).map((word, index) => (
									<span
										key={`pending-${index}`}
										className="pp-inspect-timeline__word pp-inspect-timeline__word--pending"
									>
										{word}
									</span>
								))}
							</span>
						)}
				</Track>
			</div>

			<div className="pp-inspect-timeline__ruler">
				<span>0:00</span>
				<span className="pp-inspect-timeline__playhead-label">{formatMs(playheadMs)}</span>
				<span>{formatMs(durationMs)}</span>
			</div>

			{payload.mounted && payloadData && (
				<pre
					className={popupClassName(payload.open, 'pp-inspect-timeline__payload')}
					onTransitionEnd={payload.onTransitionEnd}
				>
					{JSON.stringify(payloadData, null, 2)}
				</pre>
			)}

		</aside>
			)}
		{replayCursor.mounted && replayCursorPointer && (
			<InspectReplayOverlay
				editor={editor}
				replayPointer={replayCursorPointer}
				open={replayCursor.open}
				onTransitionEnd={replayCursor.onTransitionEnd}
			/>
		)}
		</>
	)
}

function InspectReplayOverlay({
	editor,
	replayPointer,
	open,
	onTransitionEnd,
}: {
	editor: Editor
	replayPointer: PointerSample
	open: boolean
	onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void
}) {
	return createPortal(
		<ReplayCanvasCursor
			editor={editor}
			pagePoint={replayPointer.pagePoint}
			open={open}
			onTransitionEnd={onTransitionEnd}
		/>,
		document.body
	)
}

function ReplayCanvasCursor({
	editor,
	pagePoint,
	open,
	onTransitionEnd,
}: {
	editor: Editor
	pagePoint: { x: number; y: number }
	open: boolean
	onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void
}) {
	const screen = editor.pageToScreen(pagePoint)
	return (
		<div
			className={popupClassName(open, 'pp-inspect-replay-cursor')}
			style={{ left: screen.x, top: screen.y }}
			aria-hidden
			onTransitionEnd={onTransitionEnd}
		>
			<span className="pp-inspect-replay-cursor__ring" />
			<span className="pp-inspect-replay-cursor__dot" />
		</div>
	)
}

function activeLabel(session: SpatialTranscriptSession): string {
	return session.endedAt ? '' : ' · live'
}

function segmentStyle(startMs: number, endMs: number, durationMs: number) {
	if (durationMs <= 0) return { left: '0%', width: '0%' }
	const left = (startMs / durationMs) * 100
	const width = Math.max(((endMs - startMs) / durationMs) * 100, 0.8)
	return { left: `${left}%`, width: `${width}%` }
}

function Playhead({ playheadMs, durationMs }: { playheadMs: number; durationMs: number }) {
	return (
		<div
			className="pp-inspect-timeline__playhead"
			style={{ left: `${(playheadMs / durationMs) * 100}%` }}
			aria-hidden
		/>
	)
}

function Track({
	label,
	badge,
	empty,
	clip,
	children,
}: {
	label: string
	badge?: string
	empty?: string
	clip?: boolean
	children: ReactNode
}) {
	return (
		<div className="pp-inspect-timeline__track">
			<span className="pp-inspect-timeline__track-label">
				{label}
				{badge && <span className="pp-inspect-timeline__track-badge">{badge}</span>}
			</span>
			<div
				className={
					'pp-inspect-timeline__track-lane' +
					(clip ? ' pp-inspect-timeline__track-lane--clip' : '')
				}
			>
				{empty ? <span className="pp-inspect-timeline__track-empty">{empty}</span> : children}
			</div>
		</div>
	)
}
