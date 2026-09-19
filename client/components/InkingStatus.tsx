import { useEffect } from 'react'

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
	useEffect(() => {
		if (!message || variant === 'inking' || onEndCall || !onDismiss) return
		const timer = window.setTimeout(onDismiss, autoDismissMs)
		return () => window.clearTimeout(timer)
	}, [message, variant, onDismiss, onEndCall, autoDismissMs])

	if (!message) return null

	return (
		<div
			className={`pp-inking-status pp-inking-status--${variant}`}
			role="status"
			aria-live="polite"
		>
			{variant === 'inking' && <span className="pp-inking-status__pulse" aria-hidden />}
			<span className="pp-inking-status__text">{message}</span>
			{variant === 'inking' && onEndCall && (
				<button type="button" className="pp-inking-status__end-call" onClick={onEndCall}>
					End call
				</button>
			)}
			{variant === 'inking' && onCancel && !onEndCall && (
				<button type="button" className="pp-inking-status__cancel" onClick={onCancel}>
					Cancel
					<kbd className="pp-kbd">Esc</kbd>
				</button>
			)}
		</div>
	)
}
