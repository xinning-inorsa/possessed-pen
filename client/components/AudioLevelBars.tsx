type AudioLevelBarsProps = {
	level: number
	active: boolean
	idleShimmer?: boolean
}

const BAR_COUNT = 14

export function AudioLevelBars({ level, active, idleShimmer = false }: AudioLevelBarsProps) {
	if (!active && !idleShimmer) return null

	return (
		<span
			className={`pp-audio-level${idleShimmer && !active ? ' pp-audio-level--idle' : ''}`}
			aria-hidden
		>
			{Array.from({ length: BAR_COUNT }, (_, index) => {
				const center = (index + 0.5) / BAR_COUNT
				const distance = Math.abs(center - 0.5) * 2
				const sensitivity = 1 - distance * 0.4
				const barLevel = idleShimmer && !active
					? 0.22 + (index % 5) * 0.08
					: Math.max(0.15, Math.min(1, level * sensitivity * 1.5))

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
