import { Editor } from '@tldraw/editor'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getShapeLabel, isDeicticWord } from '../lib/deixisResolver'
import { useInspectableSession } from '../hooks/useInspectableSession'
import {
	getSessionDurationMs,
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

type InspectTimelineProps = {
	editor: Editor
}

export function InspectTimeline({ editor }: InspectTimelineProps) {
	const { session, live } = useInspectableSession()
	const [expanded, setExpanded] = useState(false)
	const [playheadMs, setPlayheadMs] = useState(0)
	const [showPayload, setShowPayload] = useState(false)
	const [hoverPointer, setHoverPointer] = useState<{
		tMs: number
		labels: string[]
	} | null>(null)
	const panelRef = useRef<HTMLElement>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const playingUtteranceRef = useRef<string | null>(null)
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
	const utteranceCount = session?.utterances.length ?? 0
	const moveCount = session?.pointerSamples.filter((s) => s.eventType === 'move').length ?? 0
	const pointerCount = session?.pointerSamples.length ?? 0

	const collapse = useCallback(() => setExpanded(false), [])
	const expand = useCallback(() => setExpanded(true), [])

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
			audioRef.current?.pause()
			audioRef.current = null
		}
	}, [])

	const scrubTo = useCallback(
		(clientX: number, trackEl: HTMLElement) => {
			if (durationMs <= 0) return
			const rect = trackEl.getBoundingClientRect()
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
			setPlayheadMs(ratio * durationMs)
		},
		[durationMs]
	)

	const playUtterance = useCallback(
		(utterance: SessionUtterance) => {
			if (!utterance.audioBlobUrl) return

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
		[]
	)

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

	const pointerTrail = useMemo(() => {
		if (!session?.pointerSamples.length || durationMs <= 0) return ''
		const moves = session.pointerSamples.filter((s) => s.eventType === 'move')
		const samples = moves.length > 1 ? moves : session.pointerSamples
		return samples
			.map((sample) => {
				const x = (sample.tMs / durationMs) * 100
				const y =
					samples.length > 1
						? 20 + (sample.pagePoint.y % 60)
						: 50
				return `${x},${y}`
			})
			.join(' ')
	}, [durationMs, session?.pointerSamples])

	const pendingAudioEndMs = live.isListening ? durationMs : undefined

	if (!session) return null

	const chipDetail =
		utteranceCount > 0
			? `${utteranceCount} utterance${utteranceCount === 1 ? '' : 's'}`
			: pointerCount > 0
				? `${moveCount} moves`
				: isLive
					? 'live'
					: 'empty'

	if (!expanded) {
		return (
			<button
				type="button"
				className="pp-inspect-timeline__chip"
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
		)
	}

	const hasAudioData = session.utterances.length > 0 || live.isListening
	const hasTranscriptData =
		session.utterances.some((u) => u.transcript.trim().length > 0) ||
		live.isTranscribing ||
		Boolean(live.pendingTranscript)
	const hasPointerData = pointerCount > 0

	return (
		<aside
			ref={panelRef}
			id="pp-inspect-timeline-panel"
			className="pp-inspect-timeline pp-inspect-timeline--expanded"
			aria-label="Call inspect timeline"
		>
			<div className="pp-inspect-timeline__header">
				<span className="pp-inspect-timeline__title">Inspect</span>
				<span className="pp-inspect-timeline__meta">
					{formatMs(durationMs)}
					{activeLabel(session)}
				</span>
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
				{durationMs > 0 && <Playhead playheadMs={playheadMs} durationMs={durationMs} />}

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
							<polyline points={pointerTrail} vectorEffect="non-scaling-stroke" />
						</svg>
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
					{hoverPointer && (
						<span
							className="pp-inspect-timeline__pointer-tip"
							style={{ left: `${(hoverPointer.tMs / durationMs) * 100}%` }}
						>
							{hoverPointer.labels.join(', ')}
						</span>
					)}
				</Track>

				<Track
					label="Transcript"
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
					{session.utterances.flatMap((utterance) => {
						const words = getUtteranceWords(utterance)
						return words.map((word, index) => {
							const tMs = utterance.tMsStart + ((word.start + word.end) / 2) * 1000
							const ref = isDeicticWord(word.word) ? findRefForWord(utterance, word.word) : undefined
							return (
								<span
									key={`${utterance.id}-${index}`}
									className={
										'pp-inspect-timeline__word' +
										(ref ? ' pp-inspect-timeline__word--deictic' : '')
									}
									style={{ left: `${(tMs / durationMs) * 100}%` }}
									title={
										ref
											? `${word.word} → ${(ref.labels ?? ref.shapeIds).join(', ')}`
											: word.word
									}
								>
									{word.word}
								</span>
							)
						})
					})}
					{live.isTranscribing && (
						<span
							className="pp-inspect-timeline__word pp-inspect-timeline__word--pending"
							style={{ left: '85%' }}
						>
							Transcribing…
						</span>
					)}
					{live.pendingTranscript && !live.isTranscribing && (
						<span
							className="pp-inspect-timeline__word pp-inspect-timeline__word--pending"
							style={{ left: '4%' }}
							title={live.pendingTranscript}
						>
							{live.pendingTranscript.length > 48
								? `${live.pendingTranscript.slice(0, 45)}…`
								: live.pendingTranscript}
						</span>
					)}
				</Track>
			</div>

			<div className="pp-inspect-timeline__ruler">
				<span>0:00</span>
				<span className="pp-inspect-timeline__playhead-label">{formatMs(playheadMs)}</span>
				<span>{formatMs(durationMs)}</span>
			</div>

			{showPayload && payloadPreview && (
				<pre className="pp-inspect-timeline__payload">{JSON.stringify(payloadPreview, null, 2)}</pre>
			)}
		</aside>
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
	children,
}: {
	label: string
	badge?: string
	empty?: string
	children: ReactNode
}) {
	return (
		<div className="pp-inspect-timeline__track">
			<span className="pp-inspect-timeline__track-label">
				{label}
				{badge && <span className="pp-inspect-timeline__track-badge">{badge}</span>}
			</span>
			<div className="pp-inspect-timeline__track-lane">
				{empty ? <span className="pp-inspect-timeline__track-empty">{empty}</span> : children}
			</div>
		</div>
	)
}
