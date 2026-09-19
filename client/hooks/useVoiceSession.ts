import { Editor } from '@tldraw/editor'
import { useCallback, useRef, useState } from 'react'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import {
	flashResolvedShapes,
	resolveDeixis,
} from '../lib/deixisResolver'
import {
	appendUtterance,
	beginSpatialTranscriptSession,
	clearSpatialTranscriptSession,
	finalizeActiveSession,
	setLiveCallState,
	snapshotUtterancePointerState,
} from '../lib/spatialTranscript'
import { transcribeAudio } from '../lib/transcribeAudio'
import { createVadMonitor } from '../lib/vad'
import type { CommandStatus } from './usePenCommand'
import { usePointerSampler } from './usePointerSampler'

const LOG_PREFIX = '[pp-voice]'

type UseVoiceSessionOptions = {
	editor: Editor
	submit: (
		text: string,
		refs?: SpatialRef[],
		options?: { quiet?: boolean; movementContext?: MovementContext }
	) => Promise<void>
	isGenerating: boolean
	setStatus: (status: CommandStatus | string | null, variant?: CommandStatus['variant']) => void
	onTranscript?: (text: string) => void
}

function pickRecorderMimeType(): string | undefined {
	const candidates = [
		'audio/ogg;codecs=opus',
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/mp4',
	]
	for (const type of candidates) {
		if (MediaRecorder.isTypeSupported(type)) return type
	}
	return undefined
}

export function useVoiceSession({
	editor,
	submit,
	isGenerating,
	setStatus,
	onTranscript,
}: UseVoiceSessionOptions) {
	const [isOnCall, setIsOnCall] = useState(false)
	const [isListening, setIsListening] = useState(false)
	const [isTranscribing, setIsTranscribing] = useState(false)
	const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)

	const mediaStreamRef = useRef<MediaStream | null>(null)
	const utteranceRecorderRef = useRef<MediaRecorder | null>(null)
	const utteranceChunksRef = useRef<Blob[]>([])
	const utteranceStartMsRef = useRef(0)
	const callStartMsRef = useRef(0)
	const vadStopRef = useRef<(() => void) | null>(null)
	const processingUtteranceRef = useRef(false)
	const isOnCallRef = useRef(false)
	const isGeneratingRef = useRef(isGenerating)
	const endCallRef = useRef<() => Promise<void>>(async () => {})

	isOnCallRef.current = isOnCall
	isGeneratingRef.current = isGenerating

	const { start: startSampler, stop: stopSampler } = usePointerSampler(editor)

	const setCallStatus = useCallback(
		(message: string, variant: CommandStatus['variant'] = 'inking') => {
			setStatus({
				message,
				variant,
				onEndCall: isOnCallRef.current ? () => void endCallRef.current() : undefined,
			})
		},
		[setStatus]
	)

	const cleanupStream = useCallback(() => {
		vadStopRef.current?.()
		vadStopRef.current = null

		const recorder = utteranceRecorderRef.current
		if (recorder && recorder.state !== 'inactive') {
			recorder.stop()
		}
		utteranceRecorderRef.current = null

		for (const track of mediaStreamRef.current?.getTracks() ?? []) {
			track.stop()
		}
		mediaStreamRef.current = null
		setMediaStream(null)
	}, [])

	const stopUtteranceRecorder = useCallback(async (): Promise<Blob | null> => {
		const recorder = utteranceRecorderRef.current
		if (!recorder || recorder.state === 'inactive') return null

		return new Promise<Blob>((resolve, reject) => {
			recorder.addEventListener(
				'stop',
				() => {
					const mimeType = recorder.mimeType || 'audio/webm'
					resolve(new Blob(utteranceChunksRef.current, { type: mimeType }))
				},
				{ once: true }
			)
			recorder.addEventListener('error', () => reject(new Error('Recording failed')), {
				once: true,
			})
			recorder.stop()
		})
	}, [])

	const processUtterance = useCallback(
		async (blob: Blob, utteranceStartMs: number, utteranceEndMs: number) => {
			if (blob.size === 0) {
				console.info(`${LOG_PREFIX} skip empty utterance`)
				return
			}

			console.info(`${LOG_PREFIX} transcribe start`, {
				bytes: blob.size,
				type: blob.type,
				durationMs: Math.round(utteranceEndMs - utteranceStartMs),
			})

			processingUtteranceRef.current = true
			setIsTranscribing(true)
			setLiveCallState({
				isListening: false,
				isTranscribing: true,
				pendingUtteranceStartMs: undefined,
			})
			setCallStatus('Transcribing…')

			try {
				const { transcript, words } = await transcribeAudio(blob)
				console.info(`${LOG_PREFIX} transcribe ok`, {
					chars: transcript.length,
					words: words?.length ?? 0,
				})
				const pointerState = snapshotUtterancePointerState(utteranceStartMs, utteranceEndMs)
				const durationMs = utteranceEndMs - utteranceStartMs
				const { refs, resolvedText, movementContext } = resolveDeixis({
					transcript,
					words,
					samples: pointerState.samples,
					dwellRegions: pointerState.dwellRegions,
					circledRegions: pointerState.circledRegions,
					recordingDurationMs: durationMs,
					editor,
				})

				appendUtterance({
					tMsStart: utteranceStartMs,
					tMsEnd: utteranceEndMs,
					transcript,
					words,
					refs: refs.length > 0 ? refs : undefined,
					audioBlobUrl: URL.createObjectURL(blob),
					llmPayload: {
						prompt: resolvedText,
						refs: refs.length > 0 ? refs : undefined,
						movementContext,
					},
				})
				setLiveCallState({
					isTranscribing: false,
					pendingTranscript: resolvedText,
				})

				onTranscript?.(resolvedText)
				flashResolvedShapes(editor, refs)

				const snippet =
					resolvedText.length > 72 ? `${resolvedText.slice(0, 69)}…` : resolvedText

				setCallStatus('Inking…')
				console.info(`${LOG_PREFIX} submit`, { chars: resolvedText.length, refs: refs.length })
				await submit(resolvedText, refs.length > 0 ? refs : undefined, {
					quiet: true,
					movementContext,
				})
				console.info(`${LOG_PREFIX} submit ok`)

				if (isOnCallRef.current) {
					setCallStatus(`On call… · "${snippet}"`)
				} else {
					setStatus(`"${snippet}"`, 'success')
				}
			} catch (e) {
				const message = e instanceof Error ? e.message : 'Transcription failed'
				console.error(`${LOG_PREFIX} utterance failed`, message, e)
				if (isOnCallRef.current) {
					setCallStatus(message, 'error')
				} else {
					setStatus(message, 'error')
				}
			} finally {
				processingUtteranceRef.current = false
				setIsTranscribing(false)
				if (isOnCallRef.current) {
					setLiveCallState({ isTranscribing: false })
					if (!isGeneratingRef.current) {
						setCallStatus('On call…')
					}
				}
			}
		},
		[editor, onTranscript, setCallStatus, setStatus, submit]
	)

	const finishUtteranceRecording = useCallback(async () => {
		setIsListening(false)
		setLiveCallState({ isListening: false })
		const utteranceEndMs = performance.now() - callStartMsRef.current
		const utteranceStartMs = utteranceStartMsRef.current

		console.info(`${LOG_PREFIX} speechEnd flush`, {
			durationMs: Math.round(utteranceEndMs - utteranceStartMs),
		})

		const blob = await stopUtteranceRecorder()
		utteranceRecorderRef.current = null

		if (!blob || blob.size === 0) {
			console.info(`${LOG_PREFIX} no audio captured for utterance`)
			if (isOnCallRef.current) {
				setCallStatus('On call…')
			}
			return
		}

		await processUtterance(blob, utteranceStartMs, utteranceEndMs)
	}, [processUtterance, setCallStatus, stopUtteranceRecorder])

	const startUtteranceRecording = useCallback(() => {
		const stream = mediaStreamRef.current
		if (!stream || utteranceRecorderRef.current) return

		utteranceChunksRef.current = []
		utteranceStartMsRef.current = performance.now() - callStartMsRef.current

		const mimeType = pickRecorderMimeType()
		const recorder = mimeType
			? new MediaRecorder(stream, { mimeType })
			: new MediaRecorder(stream)

		recorder.addEventListener('dataavailable', (event) => {
			if (event.data.size > 0) {
				utteranceChunksRef.current.push(event.data)
			}
		})

		recorder.start(100)
		utteranceRecorderRef.current = recorder
		setIsListening(true)
		setLiveCallState({
			isListening: true,
			isTranscribing: false,
			pendingUtteranceStartMs: utteranceStartMsRef.current,
			pendingTranscript: undefined,
		})
		setCallStatus('Listening…')
		console.info(`${LOG_PREFIX} speechStart`, { mimeType: recorder.mimeType })
	}, [setCallStatus])

	const endCall = useCallback(async () => {
		if (!isOnCallRef.current) return

		console.info(`${LOG_PREFIX} endCall`, {
			hasPendingRecorder: Boolean(utteranceRecorderRef.current),
			isTranscribing: processingUtteranceRef.current,
		})

		isOnCallRef.current = false
		setIsOnCall(false)
		setIsListening(false)

		const hadPendingUtterance = Boolean(utteranceRecorderRef.current)
		if (hadPendingUtterance) {
			await finishUtteranceRecording()
		}

		stopSampler()
		cleanupStream()
		finalizeActiveSession()

		// Keep success/error from processUtterance; only clear idle call chrome.
		if (!hadPendingUtterance && !processingUtteranceRef.current) {
			setStatus(null)
		}
	}, [cleanupStream, finishUtteranceRecording, setStatus, stopSampler])

	endCallRef.current = endCall

	const startCall = useCallback(async () => {
		if (isGenerating || isOnCall || isTranscribing) return

		if (!navigator.mediaDevices?.getUserMedia) {
			setCallStatus('Microphone not supported in this browser', 'error')
			return
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			mediaStreamRef.current = stream
			setMediaStream(stream)

			const session = beginSpatialTranscriptSession()
			callStartMsRef.current = session.startedAt
			startSampler()

			isOnCallRef.current = true
			setIsOnCall(true)
			setCallStatus('On call…')
			console.info(`${LOG_PREFIX} startCall`)

			vadStopRef.current = createVadMonitor(stream, {
				onSpeechStart: () => {
					if (isGeneratingRef.current || processingUtteranceRef.current) return
					startUtteranceRecording()
				},
				onSpeechEnd: () => {
					if (!utteranceRecorderRef.current) return
					void finishUtteranceRecording()
				},
			}).stop
		} catch (e) {
			console.error(`${LOG_PREFIX} startCall failed`, e)
			cleanupStream()
			clearSpatialTranscriptSession()
			setCallStatus('Microphone permission denied', 'error')
		}
	}, [
		cleanupStream,
		finishUtteranceRecording,
		isGenerating,
		isOnCall,
		isTranscribing,
		setCallStatus,
		startSampler,
		startUtteranceRecording,
	])

	const toggleCall = useCallback(() => {
		if (isOnCall) {
			void endCall()
		} else {
			void startCall()
		}
	}, [endCall, isOnCall, startCall])

	const voiceBusy = isOnCall || isTranscribing
	const micDisabled = isGenerating

	return {
		isOnCall,
		isListening,
		isTranscribing,
		voiceBusy,
		micDisabled,
		mediaStream,
		toggleCall,
		endCall,
	}
}
