import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import type { TranscriptWord } from '../../shared/types/TranscriptWord'
import { TRAIL_WINDOW_MS, trimRegionsByAge, trimSamplesByAge } from './pointerGestures'

export type { TranscriptWord }

export type PointerEventType = 'move' | 'down' | 'up'

export type PointerSample = {
	tMs: number
	pagePoint: { x: number; y: number }
	screenPoint?: { x: number; y: number }
	shapeIds: string[]
	selectedShapeIds: string[]
	eventType: PointerEventType
}

export type DwellRegion = {
	tMsStart: number
	tMsEnd: number
	pagePoint: { x: number; y: number }
	shapeIds: string[]
	durationMs: number
}

export type CircledRegion = {
	tMsStart: number
	tMsEnd: number
	bounds: { x: number; y: number; w: number; h: number }
	shapeIds: string[]
}

export type UtteranceLlmPayload = {
	prompt: string
	refs?: SpatialRef[]
	movementContext?: MovementContext
}

export type SessionUtterance = {
	id: string
	tMsStart: number
	tMsEnd: number
	transcript: string
	words?: TranscriptWord[]
	refs?: SpatialRef[]
	audioBlobUrl?: string
	llmPayload?: UtteranceLlmPayload
}

/** Mic RMS (0–1, same scale as useAudioLevel) at session time tMs. */
export type AudioEnvelopeSample = {
	tMs: number
	rms: number
}

export type SpatialTranscriptSession = {
	id: string
	startedAt: number
	endedAt?: number
	pointerSamples: PointerSample[]
	dwellRegions: DwellRegion[]
	circledRegions: CircledRegion[]
	utterances: SessionUtterance[]
	audioEnvelope: AudioEnvelopeSample[]
}

let activeSession: SpatialTranscriptSession | null = null
let lastSession: SpatialTranscriptSession | null = null
let sessionVersion = 0
let lastPointerNotifyMs = 0
const listeners = new Set<() => void>()

export type LiveCallState = {
	isListening: boolean
	isTranscribing: boolean
	pendingUtteranceStartMs?: number
	pendingTranscript?: string
}

let liveCallState: LiveCallState = {
	isListening: false,
	isTranscribing: false,
}

function notifyListeners(): void {
	sessionVersion++
	for (const listener of listeners) {
		listener()
	}
}

function revokeSessionAudio(session: SpatialTranscriptSession | null): void {
	if (!session) return
	for (const utterance of session.utterances) {
		if (utterance.audioBlobUrl) {
			URL.revokeObjectURL(utterance.audioBlobUrl)
		}
	}
}

function trimSessionTrail(session: SpatialTranscriptSession, nowMs: number): void {
	const cutoff = nowMs - TRAIL_WINDOW_MS
	session.pointerSamples = trimSamplesByAge(session.pointerSamples, cutoff)
	session.dwellRegions = trimRegionsByAge(session.dwellRegions, cutoff)
	session.circledRegions = trimRegionsByAge(session.circledRegions, cutoff)
}

export function subscribeSpatialTranscriptSession(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function getInspectableSession(): SpatialTranscriptSession | null {
	return activeSession ?? lastSession
}

export function getInspectableSessionVersion(): number {
	return sessionVersion
}

export function getLiveCallState(): LiveCallState {
	return liveCallState
}

export function setLiveCallState(partial: Partial<LiveCallState>): void {
	liveCallState = { ...liveCallState, ...partial }
	notifyListeners()
}

export function resetLiveCallState(): void {
	liveCallState = { isListening: false, isTranscribing: false }
}

export function getActiveSpatialTranscriptSession(): SpatialTranscriptSession | null {
	return activeSession
}

export function beginSpatialTranscriptSession(): SpatialTranscriptSession {
	revokeSessionAudio(activeSession)
	revokeSessionAudio(lastSession)
	activeSession = null
	lastSession = null

	activeSession = {
		id: crypto.randomUUID(),
		startedAt: performance.now(),
		pointerSamples: [],
		dwellRegions: [],
		circledRegions: [],
		utterances: [],
		audioEnvelope: [],
	}
	lastPointerNotifyMs = 0
	resetLiveCallState()
	notifyListeners()
	return activeSession
}

export function appendPointerSample(sample: PointerSample): void {
	if (!activeSession) return
	activeSession.pointerSamples.push(sample)
	trimSessionTrail(activeSession, sample.tMs)

	const now = performance.now()
	const count = activeSession.pointerSamples.length
	if (
		sample.eventType !== 'move' ||
		count === 1 ||
		now - lastPointerNotifyMs >= 200
	) {
		lastPointerNotifyMs = now
		notifyListeners()
	}
}

export function appendDwellRegion(region: DwellRegion): void {
	if (!activeSession) return
	activeSession.dwellRegions.push(region)
	trimSessionTrail(activeSession, region.tMsEnd)
	notifyListeners()
}

export function appendCircledRegion(region: CircledRegion): void {
	if (!activeSession) return
	activeSession.circledRegions.push(region)
	trimSessionTrail(activeSession, region.tMsEnd)
	notifyListeners()
}

function targetSession(): SpatialTranscriptSession | null {
	return activeSession ?? lastSession
}

/** Store analyser RMS while a call is active (VAD already computes this). */
export function appendAudioEnvelopeSample(rms: number): void {
	if (!activeSession) return
	if (!activeSession.audioEnvelope) activeSession.audioEnvelope = []
	const tMs = Math.max(0, performance.now() - activeSession.startedAt)
	const level = Math.min(1, rms * 10)
	const samples = activeSession.audioEnvelope
	const last = samples[samples.length - 1]
	if (last && tMs - last.tMs < 40) {
		last.rms = Math.max(last.rms, level)
		last.tMs = tMs
		return
	}
	samples.push({ tMs, rms: level })
}

export function appendUtterance(
	utterance: Omit<SessionUtterance, 'id'>
): SessionUtterance | null {
	const session = targetSession()
	if (!session) return null
	const entry: SessionUtterance = { ...utterance, id: crypto.randomUUID() }
	session.utterances.push(entry)
	notifyListeners()
	return entry
}

export function finalizeActiveSession(): SpatialTranscriptSession | null {
	if (!activeSession) return null
	activeSession.endedAt = performance.now() - activeSession.startedAt
	lastSession = activeSession
	activeSession = null
	resetLiveCallState()
	notifyListeners()
	return lastSession
}

export function clearSpatialTranscriptSession(): void {
	revokeSessionAudio(activeSession)
	activeSession = null
	resetLiveCallState()
	notifyListeners()
}

export function getSessionElapsedMs(session: SpatialTranscriptSession): number {
	if (session.endedAt != null) return session.endedAt
	return Math.max(0, performance.now() - session.startedAt)
}

export function getSessionDurationMs(session: SpatialTranscriptSession): number {
	let maxMs = getSessionElapsedMs(session)
	for (const sample of session.pointerSamples) {
		maxMs = Math.max(maxMs, sample.tMs)
	}
	for (const region of session.dwellRegions) {
		maxMs = Math.max(maxMs, region.tMsEnd)
	}
	for (const region of session.circledRegions) {
		maxMs = Math.max(maxMs, region.tMsEnd)
	}
	for (const utterance of session.utterances) {
		maxMs = Math.max(maxMs, utterance.tMsEnd)
	}
	for (const sample of session.audioEnvelope ?? []) {
		maxMs = Math.max(maxMs, sample.tMs)
	}
	if (liveCallState.pendingUtteranceStartMs != null) {
		maxMs = Math.max(maxMs, liveCallState.pendingUtteranceStartMs, getSessionElapsedMs(session))
	}
	return Math.max(maxMs, 1)
}

function snapshotRange<T extends { tMsStart: number; tMsEnd: number }>(
	items: T[],
	startMs: number,
	endMs: number
): T[] {
	return items.filter((item) => item.tMsEnd >= startMs && item.tMsStart <= endMs)
}

/** Pointer samples for one utterance, timestamps relative to utterance start. */
export function snapshotUtteranceSamples(startMs: number, endMs: number): PointerSample[] {
	const session = activeSession ?? lastSession
	if (!session) return []
	return session.pointerSamples
		.filter((s) => s.tMs >= startMs && s.tMs <= endMs)
		.map((s) => ({ ...s, tMs: s.tMs - startMs }))
}

export function snapshotUtteranceDwellRegions(startMs: number, endMs: number): DwellRegion[] {
	const session = activeSession ?? lastSession
	if (!session) return []
	return snapshotRange(session.dwellRegions, startMs, endMs).map((region) => ({
		...region,
		tMsStart: Math.max(region.tMsStart, startMs) - startMs,
		tMsEnd: Math.min(region.tMsEnd, endMs) - startMs,
	}))
}

export function snapshotUtteranceCircledRegions(startMs: number, endMs: number): CircledRegion[] {
	const session = activeSession ?? lastSession
	if (!session) return []
	return snapshotRange(session.circledRegions, startMs, endMs).map((region) => ({
		...region,
		tMsStart: Math.max(region.tMsStart, startMs) - startMs,
		tMsEnd: Math.min(region.tMsEnd, endMs) - startMs,
	}))
}

export function snapshotUtterancePointerState(startMs: number, endMs: number): {
	samples: PointerSample[]
	dwellRegions: DwellRegion[]
	circledRegions: CircledRegion[]
} {
	return {
		samples: snapshotUtteranceSamples(startMs, endMs),
		dwellRegions: snapshotUtteranceDwellRegions(startMs, endMs),
		circledRegions: snapshotUtteranceCircledRegions(startMs, endMs),
	}
}
