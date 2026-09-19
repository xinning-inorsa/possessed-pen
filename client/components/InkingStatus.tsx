import { useEffect, useRef } from 'react'
import { popupClassName, usePopupPresence } from '../hooks/usePopupPresence'

export type InkingStatusProps = {
	message: string | null
	variant?: 'inking' | 'success' | 'error'
	onCancel?: () => void
	onEndCall?: () => void
	onDismiss?: () => void
	autoDismissMs?: number
}

export function InkingStatus({
	message,
	variant = 'inking',
	onCancel,
	onEndCall,
	onDismiss,
	autoDismissMs = 2800,
}: InkingStatusProps) {
	const toast = usePopupPresence(Boolean(message))
	const shownRef = useRef({ message, variant, onCancel, onEndCall })
	if (message) {
		shownRef.current = { message, variant, onCancel, onEndCall }
	}

	useEffect(() => {
		if (!message || variant === 'inking' || onEndCall || !onDismiss) return
		const timer = window.setTimeout(onDismiss, autoDismissMs)
		return () => window.clearTimeout(timer)
	}, [message, variant, onDismiss, onEndCall, autoDismissMs])

	if (!toast.mounted) return null

	const shown = message
		? { message, variant, onCancel, onEndCall }
		: shownRef.current

	return (
		<div
			className={popupClassName(
				toast.open,
				'pp-inking-status',
				'pp-glass',
				`pp-inking-status--${shown.variant}`
			)}
			role="status"
			aria-live="polite"
			aria-hidden={!toast.open}
			onTransitionEnd={toast.onTransitionEnd}
		>
			{shown.variant === 'inking' && <span className="pp-inking-status__pulse" aria-hidden />}
			<span className="pp-inking-status__text">{shown.message}</span>
			{shown.variant === 'inking' && shown.onEndCall && (
				<button type="button" className="pp-inking-status__end-call" onClick={shown.onEndCall}>
					End call
				</button>
			)}
			{shown.variant === 'inking' && shown.onCancel && !shown.onEndCall && (
				<button type="button" className="pp-inking-status__cancel" onClick={shown.onCancel}>
					Cancel
					<kbd className="pp-kbd">Esc</kbd>
				</button>
			)}
		</div>
	)
}
