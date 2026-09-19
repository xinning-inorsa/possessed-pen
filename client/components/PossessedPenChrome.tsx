import { useCallback, useEffect, useState } from 'react'
import { Editor } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import type { CommandStatus } from '../hooks/usePenCommand'
import { useEmptyCanvas } from '../hooks/useEmptyCanvas'
import { CallButton } from './CallButton'
import { DemoButton } from './DemoButton'
import { InkingStatus } from './InkingStatus'
import { InspectTimeline } from './InspectTimeline'
import { ThinkingPanel } from './ThinkingPanel'
import { LayerTimeline } from './LayerTimeline'

export function PossessedPenChrome({ editor }: { editor: Editor }) {
	const agent = useAgent()
	const isEmptyCanvas = useEmptyCanvas(editor)
	const [status, setStatus] = useState<CommandStatus>({ message: null, variant: 'success' })

	const handleStatusChange = useCallback((next: CommandStatus) => {
		setStatus(next)
	}, [])

	const handleDemoStatus = useCallback((message: string | null) => {
		if (!message) {
			setStatus({ message: null, variant: 'success' })
			return
		}
		setStatus({
			message,
			variant: message.toLowerCase().includes('fail') ? 'error' : 'success',
		})
	}, [])

	const dismissStatus = useCallback(() => {
		setStatus({ message: null, variant: 'success' })
	}, [])

	useEffect(() => {
		const layout = document.querySelector('.possessed-pen-layout')
		if (!layout) return
		layout.classList.toggle('possessed-pen-layout--empty', isEmptyCanvas)
		return () => layout.classList.remove('possessed-pen-layout--empty')
	}, [isEmptyCanvas])

	// One-shot: undo persisted 25% fade from the old inactive-layer dimming effect.
	useEffect(() => {
		const restoreDimmedShapes = () => {
			for (const shape of editor.getCurrentPageShapes()) {
				if (shape.opacity === 0.25) {
					editor.updateShape({ id: shape.id, type: shape.type, opacity: 1 })
				}
			}
		}
		restoreDimmedShapes()
		const retry = window.setTimeout(restoreDimmedShapes, 400)
		return () => window.clearTimeout(retry)
	}, [editor])

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return
			}
			if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault()
				document.querySelector<HTMLButtonElement>('.pp-demo-button')?.click()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const showStageWordmark = isEmptyCanvas && status.variant !== 'inking'

	return (
		<div className="pp-overlay">
			{showStageWordmark && (
				<div className="pp-stage-wordmark" aria-hidden>
					<p className="pp-stage-wordmark__title">Possessed Pen</p>
					<p className="pp-stage-wordmark__hint">
						Start a call to draw · or press <kbd className="pp-kbd">D</kbd> for demo
					</p>
				</div>
			)}
			<DemoButton
				onStatus={handleDemoStatus}
				disabled={status.variant === 'inking'}
				isEmptyCanvas={isEmptyCanvas}
			/>
			<div className="pp-bl-dock">
				<ThinkingPanel />
				<InspectTimeline editor={editor} />
				<LayerTimeline isEmptyCanvas={isEmptyCanvas} />
			</div>
			<div className="pp-call-dock">
				{isEmptyCanvas && status.variant !== 'inking' && (
					<p className="pp-call-hint" aria-hidden>
						Start a call to draw
					</p>
				)}
				<InkingStatus
					message={status.message}
					variant={status.variant}
					onEndCall={status.onEndCall}
					onCancel={() => {
						agent.cancel()
						dismissStatus()
					}}
					onDismiss={dismissStatus}
				/>
				<CallButton onStatusChange={handleStatusChange} isEmptyCanvas={isEmptyCanvas} />
			</div>
		</div>
	)
}
