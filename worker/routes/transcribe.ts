import type { MediaEncoding } from '@aws-sdk/client-transcribe-streaming'
import { json, error, IRequest } from 'itty-router'
import {
	getAwsIamCredentials,
	transcribeCredentialsError,
} from '../awsCredentials'
import type { Environment } from '../environment'
import { transcribeWithAmazon } from '../transcribeAmazon'

const LOG_PREFIX = '[pp-transcribe]'

const SUPPORTED_ENCODINGS = new Set<MediaEncoding>(['pcm', 'ogg-opus', 'flac'])

function parseSampleRate(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string') return null
	const sampleRate = Number.parseInt(value, 10)
	return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null
}

function parseMediaEncoding(value: FormDataEntryValue | null): MediaEncoding | null {
	if (typeof value !== 'string') return null
	return SUPPORTED_ENCODINGS.has(value as MediaEncoding)
		? (value as MediaEncoding)
		: null
}

function inferMediaEncoding(blob: Blob): MediaEncoding | null {
	const type = blob.type.toLowerCase()
	if (type.includes('ogg') || type.includes('opus')) return 'ogg-opus'
	if (type.includes('flac')) return 'flac'
	if (
		type.includes('pcm') ||
		type.includes('octet-stream') ||
		type.includes('wav')
	) {
		return 'pcm'
	}
	return null
}

function defaultSampleRateForEncoding(encoding: MediaEncoding): number {
	return encoding === 'pcm' ? 16000 : 48000
}

export async function transcribe(request: IRequest, env: Environment) {
	let audioBlob: Blob | null = null
	let mediaEncoding: MediaEncoding | null = null
	let sampleRate: number | null = null

	const contentType = request.headers.get('content-type') ?? ''
	if (contentType.includes('multipart/form-data')) {
		const form = await request.formData()
		const file = form.get('audio')
		if (file instanceof Blob) {
			audioBlob = file
		}
		mediaEncoding = parseMediaEncoding(form.get('mediaEncoding'))
		sampleRate = parseSampleRate(form.get('sampleRate'))
	} else {
		const blob = await request.blob()
		if (blob.size > 0) {
			audioBlob = blob
		}
	}

	if (!audioBlob || audioBlob.size === 0) {
		console.warn(`${LOG_PREFIX} missing audio blob`)
		return error(400, 'audio blob is required')
	}

	if (!getAwsIamCredentials(env)) {
		console.warn(`${LOG_PREFIX} missing IAM credentials`)
		return error(503, transcribeCredentialsError())
	}

	const encoding = mediaEncoding ?? inferMediaEncoding(audioBlob)
	if (!encoding) {
		console.warn(`${LOG_PREFIX} unsupported encoding`, { type: audioBlob.type })
		return error(
			400,
			'Unsupported audio format. Send mediaEncoding (pcm, ogg-opus, or flac) with sampleRate.'
		)
	}

	const resolvedSampleRate = sampleRate ?? defaultSampleRateForEncoding(encoding)
	console.info(`${LOG_PREFIX} request`, {
		bytes: audioBlob.size,
		encoding,
		sampleRate: resolvedSampleRate,
	})

	try {
		const audio = new Uint8Array(await audioBlob.arrayBuffer())
		const { transcript, words } = await transcribeWithAmazon(env, {
			audio,
			mediaEncoding: encoding,
			sampleRate: resolvedSampleRate,
		})

		if (!transcript) {
			console.warn(`${LOG_PREFIX} no speech detected`, { bytes: audio.length })
			return error(502, 'No speech detected')
		}

		console.info(`${LOG_PREFIX} ok`, {
			chars: transcript.length,
			words: words.length,
		})

		return json({
			transcript,
			words: words.length > 0 ? words : undefined,
		})
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Transcription failed'
		console.error(`${LOG_PREFIX} failed`, message, e)
		return error(502, message)
	}
}
