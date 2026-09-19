import { json, error, IRequest } from 'itty-router'
import {
	getAwsIamCredentials,
	transcribeCredentialsError,
} from '../awsCredentials'
import type { Environment } from '../environment'
import {
	presignTranscribeWebsocketUrl,
	type TranscribeMediaEncoding,
} from '../transcribePresign'

const LOG_PREFIX = '[pp-transcribe]'

const SUPPORTED_ENCODINGS = new Set<TranscribeMediaEncoding>(['pcm', 'ogg-opus', 'flac'])
const ALLOWED_SAMPLE_RATES = new Set([8000, 16000, 24000, 48000])

function parseSampleRate(value: unknown): number | null {
	const sampleRate = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
	return ALLOWED_SAMPLE_RATES.has(sampleRate) ? sampleRate : null
}

function parseMediaEncoding(value: unknown): TranscribeMediaEncoding | null {
	if (typeof value !== 'string') return null
	return SUPPORTED_ENCODINGS.has(value as TranscribeMediaEncoding)
		? (value as TranscribeMediaEncoding)
		: null
}

export async function transcribe(request: IRequest, env: Environment) {
	if (!getAwsIamCredentials(env)) {
		console.warn(`${LOG_PREFIX} missing IAM credentials`)
		return error(503, transcribeCredentialsError())
	}

	let mediaEncoding: TranscribeMediaEncoding = 'pcm'
	let sampleRate = 16000

	const contentType = request.headers.get('content-type') ?? ''
	if (contentType.includes('application/json')) {
		const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
		if (body) {
			const encoding = parseMediaEncoding(body.mediaEncoding)
			if (body.mediaEncoding != null && !encoding) {
				return error(400, 'Unsupported audio format. Send mediaEncoding pcm with sampleRate 16000.')
			}
			if (encoding) mediaEncoding = encoding

			const rate = parseSampleRate(body.sampleRate)
			if (body.sampleRate != null && rate == null) {
				return error(400, 'sampleRate must be 8000, 16000, 24000, or 48000')
			}
			if (rate) sampleRate = rate
		}
	}

	try {
		const url = await presignTranscribeWebsocketUrl(env, {
			mediaEncoding,
			sampleRate,
		})
		console.info(`${LOG_PREFIX} presign ok`, { mediaEncoding, sampleRate })
		return json({ url, mediaEncoding, sampleRate })
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Transcription failed'
		console.error(`${LOG_PREFIX} presign failed`, message, e)
		return error(502, message)
	}
}
