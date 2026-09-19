import { parseApiError } from './parseApiError'
import {
	prepareAudioForTranscribe,
	type PreparedTranscribeAudio,
} from './prepareAudioForTranscribe'
import type { TranscriptWord } from './spatialTranscript'
import { transcribePcmOverWebsocket } from './transcribeAmazonWebsocket'

export type TranscribeResponse = {
	transcript: string
	words?: TranscriptWord[]
}

type TranscribeUrlResponse = {
	url: string
	sampleRate: number
	mediaEncoding: string
}

const LOG_PREFIX = '[pp-voice]'

export function voiceTranscribeUserMessage(
	raw: string,
	prepared?: Pick<PreparedTranscribeAudio, 'peakAmplitude' | 'durationSec'>
): string {
	const lower = raw.toLowerCase()

	if (raw === 'No audio detected' || lower.includes('silent pcm')) {
		return 'No audio captured — check your microphone and try again'
	}

	if (lower.includes('no speech detected')) {
		if (prepared && prepared.peakAmplitude >= 0 && prepared.peakAmplitude < 2000) {
			return "Couldn't make out speech — speak closer to the mic and try again"
		}
		return 'No speech detected — try speaking clearly while on call'
	}

	if (lower.includes('stream is too big')) {
		return 'Recording too long for transcription — try shorter utterances'
	}

	if (lower.includes('timeout') || lower.includes('timed out')) {
		return 'Transcription timed out — try a shorter recording'
	}

	if (lower.includes('missing aws') || lower.includes('credentials')) {
		return 'Transcription unavailable — check AWS credentials in .dev.vars'
	}

	return raw
}

export async function transcribeAudio(blob: Blob): Promise<TranscribeResponse> {
	const prepared = await prepareAudioForTranscribe(blob)
	console.info(`${LOG_PREFIX} transcribe request`, {
		bytes: prepared.blob.size,
		mediaEncoding: prepared.mediaEncoding,
		sampleRate: prepared.sampleRate,
		durationSec: Number(prepared.durationSec.toFixed(2)),
		peakAmplitude: prepared.peakAmplitude,
	})

	if (prepared.peakAmplitude >= 0 && prepared.peakAmplitude < 500) {
		console.warn(`${LOG_PREFIX} silent pcm after decode`, {
			peakAmplitude: prepared.peakAmplitude,
			durationSec: prepared.durationSec,
		})
		throw new Error(voiceTranscribeUserMessage('No audio detected', prepared))
	}

	const response = await fetch('/api/transcribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			mediaEncoding: prepared.mediaEncoding,
			sampleRate: prepared.sampleRate,
		}),
	})

	if (!response.ok) {
		const text = await response.text()
		const message = parseApiError(text, `Transcription failed (${response.status})`)
		console.error(`${LOG_PREFIX} transcribe failed`, { status: response.status, message })
		throw new Error(voiceTranscribeUserMessage(message, prepared))
	}

	const session = (await response.json()) as TranscribeUrlResponse
	const pcm = new Uint8Array(await prepared.blob.arrayBuffer())

	try {
		const { transcript, words } = await transcribePcmOverWebsocket(
			session.url,
			pcm,
			session.sampleRate
		)

		if (!transcript) {
			throw new Error(
				prepared.durationSec >= 3
					? "Couldn't make out speech — speak closer to the mic and try again"
					: 'No speech detected — try speaking clearly while on call'
			)
		}

		console.info(`${LOG_PREFIX} transcribe response`, { chars: transcript.length })
		return {
			transcript,
			words: words.length > 0 ? words : undefined,
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Transcription failed'
		console.error(`${LOG_PREFIX} transcribe failed`, { message })
		throw new Error(voiceTranscribeUserMessage(message, prepared))
	}
}
