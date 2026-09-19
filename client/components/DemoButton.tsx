import { useCallback, useState } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { AUTH_FLOW_NATIVE } from '../demo/authFlowNative'
import { applyNativeDiagramWithLayer } from '../demo/applyNativeDiagramWithLayer'
import { useLayers } from '../layers/LayerContext'

function newLayerId() {
	return `layer-${crypto.randomUUID()}`
}

export type DemoButtonProps = {
	disabled?: boolean
	onStatus?: (message: string | null) => void
	isEmptyCanvas?: boolean
}

export function DemoButton({ disabled, onStatus, isEmptyCanvas }: DemoButtonProps) {
	const agent = useAgent()
	const { editor } = agent
	const { addLayer, updateLayerShapeIds } = useLayers()
	const [loading, setLoading] = useState(false)

	const runDemo = useCallback(async () => {
		if (loading || disabled) return
		setLoading(true)
		onStatus?.(null)
		try {
			const layer = addLayer({ id: newLayerId(), name: 'Auth flow', shapeIds: [] })
			const shapeIds = await applyNativeDiagramWithLayer(editor, AUTH_FLOW_NATIVE, layer)
			updateLayerShapeIds(layer.id, shapeIds)
			editor.zoomToFit({ animation: { duration: 320 } })
			onStatus?.('Demo loaded')
		} catch (e) {
			console.error(e)
			onStatus?.(e instanceof Error ? e.message : 'Demo failed')
		} finally {
			setLoading(false)
		}
	}, [addLayer, disabled, editor, loading, onStatus, updateLayerShapeIds])

	return (
		<button
			type="button"
			className={`pp-demo-button pp-glass${isEmptyCanvas && !loading ? ' pp-demo-button--idle-empty' : ''}`}
			onClick={() => void runDemo()}
			disabled={disabled || loading}
			title="Load auth-flow diagram (offline)"
		>
			<span className="pp-demo-button__mark" aria-hidden>
				◆
			</span>
			<span>{loading ? 'Loading…' : 'Demo'}</span>
			<kbd className="pp-kbd">D</kbd>
		</button>
	)
}
