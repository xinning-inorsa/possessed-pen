export type PreparedTranscribeAudio = {
	blob: Blob
	filename: string
	mediaEncoding: 'pcm'
	sampleRate: number
	durationSec: number
	peakAmplitude: number
}

export function pcmPeakAmplitude(pcm: Uint8Array): number {
	const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2)
	let peak = 0
	for (let i = 0; i < samples.length; i++) {
		peak = Math.max(peak, Math.abs(samples[i]))
	}
	return peak
}

async function blobToPcm16k(blob: Blob): Promise<Uint8Array> {
	const arrayBuffer = await blob.arrayBuffer()
	const audioContext = new AudioContext()
	try {
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
		const targetRate = 16000
		const sourceRate = audioBuffer.sampleRate
		const sourceData = audioBuffer.getChannelData(0)

		let samples: Float32Array
		if (sourceRate === targetRate) {
			samples = sourceData
		} else {
			const ratio = sourceRate / targetRate
			const newLength = Math.max(1, Math.round(sourceData.length / ratio))
			samples = new Float32Array(newLength)
			for (let i = 0; i < newLength; i++) {
				const srcIndex = i * ratio
				const idx = Math.floor(srcIndex)
				const frac = srcIndex - idx
				const next = sourceData[idx + 1] ?? sourceData[idx] ?? 0
				samples[i] = sourceData[idx] * (1 - frac) + next * frac
			}
		}

		const pcm = new Int16Array(samples.length)
		for (let i = 0; i < samples.length; i++) {
			const sample = Math.max(-1, Math.min(1, samples[i]))
			pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
		}

		return new Uint8Array(pcm.buffer)
	} finally {
		await audioContext.close()
	}
}

export async function prepareAudioForTranscribe(
	blob: Blob
): Promise<PreparedTranscribeAudio> {
	const pcm = await blobToPcm16k(blob)
	const pcmBuffer = new ArrayBuffer(pcm.byteLength)
	new Uint8Array(pcmBuffer).set(pcm)
	const sampleCount = pcm.byteLength / 2
	return {
		blob: new Blob([pcmBuffer], { type: 'application/octet-stream' }),
		filename: 'recording.pcm',
		mediaEncoding: 'pcm',
		sampleRate: 16000,
		durationSec: sampleCount / 16000,
		peakAmplitude: pcmPeakAmplitude(pcm),
	}
}
