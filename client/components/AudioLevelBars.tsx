type AudioLevelBarsProps = {
	level: number
	active: boolean
}

const BAR_COUNT = 5

export function AudioLevelBars({ level, active }: AudioLevelBarsProps) {
	if (!active) return null

	return (
		<span className="pp-audio-level" aria-hidden>
			{Array.from({ length: BAR_COUNT }, (_, index) => {
				const center = (index + 0.5) / BAR_COUNT
				const distance = Math.abs(center - 0.5) * 2
				const sensitivity = 1 - distance * 0.35
				const barLevel = Math.max(0.18, Math.min(1, level * sensitivity * 1.4))

				return (
					<span
						key={index}
						className="pp-audio-level__bar"
						style={{ transform: `scaleY(${barLevel})` }}
					/>
				)
			})}
		</span>
	)
}
