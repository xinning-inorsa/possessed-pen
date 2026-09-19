import { appendAudioEnvelopeSample } from './spatialTranscript'

export type VadOptions = {
	silenceMs?: number
	minSpeechMs?: number
	threshold?: number
	pollMs?: number
}

export type VadCallbacks = {
	onSpeechStart: () => void
	onSpeechEnd: () => void
	/** Fires once when RMS crosses the lower energy gate (mic activity, not yet speech). */
	onEnergy?: () => void
}

const DEFAULTS = {
	/** Longer pause before splitting — avoids fragmenting natural speech. */
	silenceMs: 1500,
	minSpeechMs: 350,
	/** Speech gate — keep near useAudioLevel (`rms * 10`) so bars and VAD agree. */
	threshold: 0.01,
	/** Lower gate for "mic saw activity" without starting an utterance. */
	energyThreshold: 0.006,
	pollMs: 50,
}

/** Lightweight energy-based VAD using Web Audio AnalyserNode. */
export function createVadMonitor(
	stream: MediaStream,
	callbacks: VadCallbacks,
	options: VadOptions = {}
): { stop: () => void } {
	const { silenceMs, minSpeechMs, threshold, energyThreshold, pollMs } = {
		...DEFAULTS,
		...options,
	}

	const audioContext = new AudioContext()
	const source = audioContext.createMediaStreamSource(stream)
	const analyser = audioContext.createAnalyser()
	analyser.fftSize = 512
	analyser.smoothingTimeConstant = 0.4
	source.connect(analyser)

	const buffer = new Float32Array(analyser.fftSize)
	let speaking = false
	let speechStartedAt = 0
	let silenceStartedAt = 0
	let energySeen = false

	const intervalId = window.setInterval(() => {
		analyser.getFloatTimeDomainData(buffer)
		let sum = 0
		for (let i = 0; i < buffer.length; i++) {
			sum += buffer[i] * buffer[i]
		}
		const rms = Math.sqrt(sum / buffer.length)
		appendAudioEnvelopeSample(rms)
		const now = performance.now()

		if (!energySeen && rms >= energyThreshold) {
			energySeen = true
			callbacks.onEnergy?.()
		}

		if (rms >= threshold) {
			silenceStartedAt = 0
			if (!speaking) {
				speaking = true
				speechStartedAt = now
				callbacks.onSpeechStart()
			}
			return
		}

		if (!speaking) return

		if (silenceStartedAt === 0) {
			silenceStartedAt = now
			return
		}

		if (now - silenceStartedAt >= silenceMs && now - speechStartedAt >= minSpeechMs) {
			speaking = false
			silenceStartedAt = 0
			callbacks.onSpeechEnd()
		}
	}, pollMs)

	return {
		stop: () => {
			window.clearInterval(intervalId)
			source.disconnect()
			void audioContext.close()
		},
	}
}
