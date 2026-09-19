import { useCallback, useEffect, useState, type TransitionEvent } from 'react'

/** Must be ≥ CSS transition duration so exit can finish before unmount. */
export const POPUP_DURATION_MS = 300

export function popupClassName(
	open: boolean,
	...parts: Array<string | false | undefined | null>
): string {
	return ['pp-popup', open && 'pp-popup--open', ...parts].filter(Boolean).join(' ')
}

/**
 * Keep a popup mounted through its CSS exit transition.
 * `mounted` — render the node; `open` — `pp-popup--open` after first paint.
 */
export function usePopupPresence(wantOpen: boolean, durationMs = POPUP_DURATION_MS) {
	const [mounted, setMounted] = useState(wantOpen)
	const [open, setOpen] = useState(false)

	if (wantOpen && !mounted) {
		setMounted(true)
	}

	useEffect(() => {
		if (wantOpen) {
			const id = requestAnimationFrame(() => setOpen(true))
			return () => cancelAnimationFrame(id)
		}

		setOpen(false)
		const timeout = window.setTimeout(() => setMounted(false), durationMs)
		return () => window.clearTimeout(timeout)
	}, [wantOpen, durationMs])

	const onTransitionEnd = useCallback(
		(event: TransitionEvent<HTMLElement>) => {
			if (event.target !== event.currentTarget) return
			if (event.propertyName !== 'opacity') return
			if (!wantOpen) setMounted(false)
		},
		[wantOpen]
	)

	return { mounted, open, onTransitionEnd }
}
