import {
	StartStreamTranscriptionCommand,
	type LanguageCode,
	type MediaEncoding,
	type TranscribeStreamingClient as TranscribeStreamingClientType,
} from '@aws-sdk/client-transcribe-streaming'
import { TranscribeStreamingClient } from './transcribeStreamingClient'
import type { TranscriptWord } from '../shared/types/TranscriptWord'
import { getAwsIamCredentials, getAwsRegion } from './awsCredentials'
import type { Environment } from './environment'

const LOG_PREFIX = '[pp-transcribe]'

const DEFAULT_LANGUAGE_CODE: LanguageCode = 'en-US'

/** AWS recommends 50–200 ms PCM frames; 100 ms matches SDK examples. */
function audioChunkBytes(mediaEncoding: MediaEncoding, sampleRate: number): number {
	if (mediaEncoding === 'pcm') {
		return Math.floor((sampleRate * 2 * 100) / 1000)
	}
	// Compressed encodings: keep individual frames small.
	return 8 * 1024
}

export type TranscribeAudioInput = {
	audio: Uint8Array
	mediaEncoding: MediaEncoding
	sampleRate: number
	languageCode?: LanguageCode
}

export type TranscribeAudioResult = {
	transcript: string
	words: TranscriptWord[]
}

async function* audioEventStream(
	audio: Uint8Array,
	mediaEncoding: MediaEncoding,
	sampleRate: number
) {
	const chunkBytes = audioChunkBytes(mediaEncoding, sampleRate)
	for (let offset = 0; offset < audio.length; offset += chunkBytes) {
		yield {
			AudioEvent: {
				AudioChunk: audio.subarray(offset, offset + chunkBytes),
			},
		}
	}
}

export async function transcribeWithAmazon(
	env: Environment,
	input: TranscribeAudioInput
): Promise<TranscribeAudioResult> {
	const credentials = getAwsIamCredentials(env)
	if (!credentials) {
		throw new Error('Missing AWS IAM credentials for Amazon Transcribe')
	}

	console.info(`${LOG_PREFIX} amazon start`, {
		bytes: input.audio.byteLength,
		mediaEncoding: input.mediaEncoding,
		sampleRate: input.sampleRate,
		region: getAwsRegion(env),
	})

	const client = new TranscribeStreamingClient({
		region: getAwsRegion(env),
		credentials,
	}) as unknown as TranscribeStreamingClientType

	const command = new StartStreamTranscriptionCommand({
		LanguageCode: input.languageCode ?? DEFAULT_LANGUAGE_CODE,
		MediaEncoding: input.mediaEncoding,
		MediaSampleRateHertz: input.sampleRate,
		AudioStream: audioEventStream(input.audio, input.mediaEncoding, input.sampleRate),
	})

	const response = await client.send(command)
	const words: TranscriptWord[] = []
	const transcriptParts: string[] = []

	for await (const event of response.TranscriptResultStream ?? []) {
		const results = event.TranscriptEvent?.Transcript?.Results
		if (!results) continue

		for (const result of results) {
			if (result.IsPartial) continue

			for (const alternative of result.Alternatives ?? []) {
				const segment = alternative.Transcript?.trim()
				if (segment) transcriptParts.push(segment)

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
	}

	const transcript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim()
	console.info(`${LOG_PREFIX} amazon done`, {
		chars: transcript.length,
		words: words.length,
	})
	return { transcript, words }
}
