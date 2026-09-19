import { useCallback, useEffect, useState } from 'react'
import { Editor } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import type { CommandStatus } from '../hooks/usePenCommand'
import { useEmptyCanvas } from '../hooks/useEmptyCanvas'
import { LayerDimmingEffect } from '../layers/LayerContext'
import { CallButton } from './CallButton'
import { DemoButton } from './DemoButton'
import { InkingStatus } from './InkingStatus'
import { InspectTimeline } from './InspectTimeline'
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

	return (
		<div className="pp-overlay">
			<LayerDimmingEffect editor={editor} />
			<DemoButton
				onStatus={handleDemoStatus}
				disabled={status.variant === 'inking'}
				isEmptyCanvas={isEmptyCanvas}
			/>
			<LayerTimeline isEmptyCanvas={isEmptyCanvas} />
			<InspectTimeline editor={editor} />
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
