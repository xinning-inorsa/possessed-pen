import { useEffect, useState } from 'react'

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Live mic RMS level (0–1) from an active MediaStream. */
export function useAudioLevel(stream: MediaStream | null, active: boolean): number {
	const [level, setLevel] = useState(0)

	useEffect(() => {
		if (!stream || !active) {
			setLevel(0)
			return
		}

		if (prefersReducedMotion()) {
			setLevel(0.2)
			return
		}

		const audioContext = new AudioContext()
		const source = audioContext.createMediaStreamSource(stream)
		const analyser = audioContext.createAnalyser()
		analyser.fftSize = 256
		analyser.smoothingTimeConstant = 0.75
		source.connect(analyser)

		const buffer = new Float32Array(analyser.fftSize)
		let rafId = 0

		const tick = () => {
			analyser.getFloatTimeDomainData(buffer)
			let sum = 0
			for (let i = 0; i < buffer.length; i++) {
				sum += buffer[i] * buffer[i]
			}
			const rms = Math.sqrt(sum / buffer.length)
			setLevel(Math.min(1, rms * 10))
			rafId = requestAnimationFrame(tick)
		}

		rafId = requestAnimationFrame(tick)

		return () => {
			cancelAnimationFrame(rafId)
			source.disconnect()
			void audioContext.close()
			setLevel(0)
		}
	}, [stream, active])

	return level
}
