import { EventStreamCodec, type Message } from '@smithy/core/event-streams'
import type { TranscriptWord } from '../../shared/types/TranscriptWord'

const LOG_PREFIX = '[pp-voice]'

/** AWS recommends 50–200 ms PCM frames. */
const PCM_FRAME_MS = 100
const TRAILING_SILENCE_MS = 300
const OPEN_TIMEOUT_MS = 5000
const IDLE_AFTER_END_MS = 10000

export type TranscribeStreamResult = {
	transcript: string
	words: TranscriptWord[]
}

type TranscriptItem = {
	Type?: string
	Content?: string
	StartTime?: number
	EndTime?: number
}

type TranscriptResult = {
	IsPartial?: boolean
	Alternatives?: Array<{
		Transcript?: string
		Items?: TranscriptItem[]
	}>
}

type TranscriptEventBody = {
	Transcript?: { Results?: TranscriptResult[] }
	Message?: string
}

function toUtf8(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes)
}

function fromUtf8(text: string): Uint8Array {
	return new TextEncoder().encode(text)
}

function encodeAudioEvent(codec: EventStreamCodec, chunk: Uint8Array): Uint8Array {
	return codec.encode({
		headers: {
			':message-type': { type: 'string', value: 'event' },
			':event-type': { type: 'string', value: 'AudioEvent' },
			':content-type': { type: 'string', value: 'application/octet-stream' },
		},
		body: chunk,
	})
}

function headerString(message: Message, name: string): string | undefined {
	const header = message.headers[name]
	return header && header.type === 'string' ? header.value : undefined
}

function parseEventBody(message: Message): TranscriptEventBody {
	if (message.body.byteLength === 0) return {}
	try {
		return JSON.parse(toUtf8(message.body)) as TranscriptEventBody
	} catch {
		return {}
	}
}

function pcmFrameBytes(sampleRate: number): number {
	return Math.floor((sampleRate * 2 * PCM_FRAME_MS) / 1000)
}

function collectFromResult(
	result: TranscriptResult,
	finals: string[],
	words: TranscriptWord[],
	partialRef: { value: string }
) {
	for (const alternative of result.Alternatives ?? []) {
		const segment = alternative.Transcript?.trim()
		if (result.IsPartial) {
			if (segment) partialRef.value = segment
			continue
		}
		if (segment) finals.push(segment)
		for (const item of alternative.Items ?? []) {
			if (
				item.Type !== 'pronunciation' ||
				!item.Content ||
				item.StartTime == null ||
				item.EndTime == null
			) {
				continue
			}
			words.push({
				word: item.Content,
				start: item.StartTime,
				end: item.EndTime,
			})
		}
	}
}

export async function transcribePcmOverWebsocket(
	url: string,
	pcm: Uint8Array,
	sampleRate: number
): Promise<TranscribeStreamResult> {
	const encoder = new EventStreamCodec(toUtf8, fromUtf8)
	const decoder = new EventStreamCodec(toUtf8, fromUtf8)
	const finals: string[] = []
	const words: TranscriptWord[] = []
	const lastPartial = { value: '' }
	let streamError: Error | null = null

	console.info(`${LOG_PREFIX} amazon websocket start`, {
		bytes: pcm.byteLength,
		sampleRate,
		durationSec: Number((pcm.byteLength / (sampleRate * 2)).toFixed(2)),
	})

	const socket = new WebSocket(url)
	socket.binaryType = 'arraybuffer'

	const closed = new Promise<void>((resolve) => {
		socket.addEventListener('close', (event) => {
			if (!streamError && event.code !== 1000 && event.reason) {
				streamError = new Error(event.reason)
			}
			resolve()
		})
	})

	socket.addEventListener('message', (event) => {
		if (!(event.data instanceof ArrayBuffer)) return
		decoder.feed(new Uint8Array(event.data))
		const available = decoder.getAvailableMessages()
		for (const message of available.getMessages()) {
			const messageType = headerString(message, ':message-type')
			const body = parseEventBody(message)
			if (messageType === 'exception') {
				streamError = new Error(body.Message || 'Amazon Transcribe rejected the stream')
				socket.close(1000)
				return
			}
			for (const result of body.Transcript?.Results ?? []) {
				collectFromResult(result, finals, words, lastPartial)
			}
		}
	})

	try {
		await new Promise<void>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				reject(new Error('Transcription timed out — WebSocket did not open'))
			}, OPEN_TIMEOUT_MS)
			socket.addEventListener(
				'open',
				() => {
					window.clearTimeout(timeout)
					resolve()
				},
				{ once: true }
			)
			socket.addEventListener(
				'error',
				() => {
					window.clearTimeout(timeout)
					reject(new Error('Transcription WebSocket connection failed'))
				},
				{ once: true }
			)
			socket.addEventListener(
				'close',
				(event) => {
					window.clearTimeout(timeout)
					reject(new Error(event.reason || 'Transcription WebSocket closed before open'))
				},
				{ once: true }
			)
		})
	} catch (e) {
		socket.close()
		throw e
	}

	const frameBytes = pcmFrameBytes(sampleRate)
	try {
		for (let offset = 0; offset < pcm.byteLength; offset += frameBytes) {
			if (socket.readyState !== WebSocket.OPEN) break
			socket.send(encodeAudioEvent(encoder, pcm.subarray(offset, offset + frameBytes)))
			await new Promise((r) => window.setTimeout(r, 0))
		}

		if (socket.readyState === WebSocket.OPEN) {
			const silence = new Uint8Array(Math.floor((sampleRate * 2 * TRAILING_SILENCE_MS) / 1000))
			socket.send(encodeAudioEvent(encoder, silence))
			socket.send(encodeAudioEvent(encoder, new Uint8Array(0)))
		}

		await Promise.race([
			closed,
			new Promise<void>((resolve) => {
				window.setTimeout(resolve, IDLE_AFTER_END_MS)
			}),
		])
	} finally {
		if (socket.readyState === WebSocket.OPEN) {
			socket.close(1000)
		}
	}

	if (streamError) throw streamError

	const transcript = (finals.join(' ') || lastPartial.value).replace(/\s+/g, ' ').trim()
	console.info(`${LOG_PREFIX} amazon websocket done`, {
		chars: transcript.length,
		words: words.length,
		usedPartial: finals.length === 0 && lastPartial.value.length > 0,
	})
	return { transcript, words }
}
