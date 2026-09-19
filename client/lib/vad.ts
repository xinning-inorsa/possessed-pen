export type VadOptions = {
	silenceMs?: number
	minSpeechMs?: number
	threshold?: number
	pollMs?: number
}

export type VadCallbacks = {
	onSpeechStart: () => void
	onSpeechEnd: () => void
}

const DEFAULTS = {
	silenceMs: 900,
	minSpeechMs: 350,
	threshold: 0.018,
	pollMs: 50,
}

/** Lightweight energy-based VAD using Web Audio AnalyserNode. */
export function createVadMonitor(
	stream: MediaStream,
	callbacks: VadCallbacks,
	options: VadOptions = {}
): { stop: () => void } {
	const { silenceMs, minSpeechMs, threshold, pollMs } = { ...DEFAULTS, ...options }

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

	const intervalId = window.setInterval(() => {
		analyser.getFloatTimeDomainData(buffer)
		let sum = 0
		for (let i = 0; i < buffer.length; i++) {
			sum += buffer[i] * buffer[i]
		}
		const rms = Math.sqrt(sum / buffer.length)
		const now = performance.now()

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
