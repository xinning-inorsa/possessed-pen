import { buildQueryString } from '@smithy/core/protocols'
import { HttpRequest } from '@smithy/core/transport'
import { SignatureV4 } from '@smithy/signature-v4'
import { getAwsIamCredentials, getAwsRegion } from './awsCredentials'
import { Sha256 } from './sha256'
import type { Environment } from './environment'

const SERVICE = 'transcribe'
/** Transcribe WebSocket presign cap is 300s. */
const EXPIRES_IN = 300
const DEFAULT_LANGUAGE = 'en-US'

export type TranscribeMediaEncoding = 'pcm' | 'ogg-opus' | 'flac'

export type TranscribeStreamParams = {
	sampleRate: number
	mediaEncoding: TranscribeMediaEncoding
	languageCode?: string
}

export async function presignTranscribeWebsocketUrl(
	env: Environment,
	params: TranscribeStreamParams
): Promise<string> {
	const credentials = getAwsIamCredentials(env)
	if (!credentials) {
		throw new Error('Missing AWS IAM credentials for Amazon Transcribe')
	}

	const region = getAwsRegion(env)
	const hostname = `transcribestreaming.${region}.amazonaws.com`
	const host = `${hostname}:8443`

	const request = new HttpRequest({
		protocol: 'https:',
		hostname,
		port: 8443,
		method: 'GET',
		path: '/stream-transcription-websocket',
		headers: { host },
		query: {
			'language-code': params.languageCode ?? DEFAULT_LANGUAGE,
			'media-encoding': params.mediaEncoding,
			'sample-rate': String(params.sampleRate),
		},
	})

	const signer = new SignatureV4({
		credentials,
		region,
		service: SERVICE,
		sha256: Sha256,
	})

	const signed = await signer.presign(request, {
		expiresIn: EXPIRES_IN,
		unsignableHeaders: new Set(
			Object.keys(request.headers).filter((header) => header.toLowerCase() !== 'host')
		),
	})

	const query = signed.query ? buildQueryString(signed.query) : ''
	const qs = !query ? '' : query.startsWith('?') ? query : `?${query}`
	return `wss://${host}${signed.path}${qs}`
}
