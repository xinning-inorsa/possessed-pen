import { parseApiError } from './parseApiError'
import { prepareAudioForTranscribe } from './prepareAudioForTranscribe'
import type { TranscriptWord } from './spatialTranscript'

export type TranscribeResponse = {
	transcript: string
	words?: TranscriptWord[]
}

const LOG_PREFIX = '[pp-voice]'

export async function transcribeAudio(blob: Blob): Promise<TranscribeResponse> {
	const prepared = await prepareAudioForTranscribe(blob)
	console.info(`${LOG_PREFIX} transcribe request`, {
		bytes: prepared.blob.size,
		mediaEncoding: prepared.mediaEncoding,
		sampleRate: prepared.sampleRate,
	})

	const form = new FormData()
	form.append('audio', prepared.blob, prepared.filename)
	form.append('mediaEncoding', prepared.mediaEncoding)
	form.append('sampleRate', String(prepared.sampleRate))

	const response = await fetch('/api/transcribe', {
		method: 'POST',
		body: form,
	})

	if (!response.ok) {
		const text = await response.text()
		const message = parseApiError(text, `Transcription failed (${response.status})`)
		console.error(`${LOG_PREFIX} transcribe failed`, { status: response.status, message })
		throw new Error(message)
	}

	const result = (await response.json()) as TranscribeResponse
	console.info(`${LOG_PREFIX} transcribe response`, { chars: result.transcript.length })
	return result
}
