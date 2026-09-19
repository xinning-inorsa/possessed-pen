import { useEffect } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { AudioLevelBars } from './AudioLevelBars'
import { useAudioLevel } from '../hooks/useAudioLevel'
import { usePenCommand, type CommandStatus } from '../hooks/usePenCommand'
import { useVoiceSession } from '../hooks/useVoiceSession'

export type CallButtonProps = {
	onStatusChange?: (status: CommandStatus) => void
	isEmptyCanvas?: boolean
}

export function CallButton({ onStatusChange, isEmptyCanvas }: CallButtonProps) {
	const { editor } = useAgent()
	const { submit, cancel, isGenerating, setStatus } = usePenCommand(onStatusChange)

	const { isOnCall, isListening, micDisabled, mediaStream, toggleCall, endCall } =
		useVoiceSession({
			editor,
			submit,
			isGenerating,
			setStatus,
		})

	const showAudioLevel = isOnCall || isListening
	const audioLevel = useAudioLevel(mediaStream, showAudioLevel)

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			const target = e.target as HTMLElement | null
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return
			}
			if (isOnCall) {
				e.preventDefault()
				void endCall()
				return
			}
			if (isGenerating) {
				e.preventDefault()
				cancel()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [cancel, endCall, isGenerating, isOnCall])

	const isActive = isOnCall || isListening
	const showIdleEmpty = isEmptyCanvas && !isActive && !isGenerating

	return (
		<button
			type="button"
			className={`pp-call-button${isActive ? ' pp-call-button--active' : ''}${isListening ? ' pp-call-button--listening' : ''}${showIdleEmpty ? ' pp-call-button--idle-empty' : ''}`}
			disabled={micDisabled}
			aria-label={isOnCall ? 'End call' : 'Start call'}
			aria-pressed={isOnCall}
			onClick={() => void toggleCall()}
		>
			{isActive && <span className="pp-call-button__pulse" aria-hidden />}
			<AudioLevelBars level={audioLevel} active={showAudioLevel} />
			<span className="pp-call-button__icon" aria-hidden>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="none">
					<rect x="5.5" y="2" width="5" height="8" rx="2.5" fill="currentColor" />
					<path
						d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V15"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
			</span>
			<span className="pp-call-button__label">{isOnCall ? 'End call' : 'Call'}</span>
		</button>
	)
}
