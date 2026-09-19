import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

const MAX_X = 6
const MAX_Y = 5

export function useMagneticHover(enabled = true) {
	const ref = useRef<HTMLDivElement>(null)
	const [offset, setOffset] = useState({ x: 0, y: 0 })
	const reducedMotionRef = useRef(false)

	useEffect(() => {
		reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	}, [])

	const onMouseMove = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!enabled || reducedMotionRef.current || !ref.current) return
			const rect = ref.current.getBoundingClientRect()
			const cx = rect.left + rect.width / 2
			const cy = rect.top + rect.height / 2
			const dx = (event.clientX - cx) / (rect.width / 2)
			const dy = (event.clientY - cy) / (rect.height / 2)
			setOffset({
				x: Math.max(-1, Math.min(1, dx)) * MAX_X,
				y: Math.max(-1, Math.min(1, dy)) * MAX_Y,
			})
		},
		[enabled]
	)

	const onMouseLeave = useCallback(() => {
		setOffset({ x: 0, y: 0 })
	}, [])

	const style = {
		transform: `translate(${offset.x}px, ${offset.y}px)`,
		transition: offset.x === 0 && offset.y === 0 ? 'transform 320ms var(--pp-ease-spring)' : 'none',
	}

	return { ref, style, onMouseMove, onMouseLeave }
}
