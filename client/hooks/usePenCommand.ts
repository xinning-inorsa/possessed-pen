import { useCallback, useState } from 'react'
import { TLShapeId, useValue } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { useLayers } from '../layers/LayerContext'
import { getShapeLabel } from '../lib/deixisResolver'
import { newLayerId } from '../lib/commandBarUtils'
import { fetchGeneratedMermaid } from '../lib/generateMermaid'
import { applyMermaidWithLayer } from '../mermaid/applyMermaidWithLayer'
import { getSelectionBounds, replaceInBounds } from '../mermaid/replaceInBounds'

export type CommandStatus = {
	message: string | null
	variant: 'inking' | 'success' | 'error'
	onEndCall?: () => void
}

export function usePenCommand(onStatusChange?: (status: CommandStatus) => void) {
	const agent = useAgent()
	const { editor } = agent
	const { addLayer, updateLayerShapeIds } = useLayers()
	const [inking, setInking] = useState(false)

	const isGenerating = useValue('isGenerating', () => agent.requests.isGenerating() || inking, [
		agent,
		inking,
	])

	const selectedIds = useValue(
		'selectedIds',
		() => editor.getSelectedShapeIds() as TLShapeId[],
		[editor]
	)

	const setStatus = useCallback(
		(status: CommandStatus | string | null, variant: CommandStatus['variant'] = 'success') => {
			if (typeof status === 'string' || status === null) {
				onStatusChange?.({ message: status, variant })
				return
			}
			onStatusChange?.(status)
		},
		[onStatusChange]
	)

	const submit = useCallback(
		async (
			text: string,
			refs?: SpatialRef[],
			options?: { quiet?: boolean; movementContext?: MovementContext }
		) => {
			const prompt = text.trim()
			if (!prompt || isGenerating) return

			setInking(true)
			if (!options?.quiet) {
				setStatus('Inking…', 'inking')
			}

			try {
				if (selectedIds.length > 0) {
					const bounds = getSelectionBounds(editor, selectedIds)
					const shapeLabels = selectedIds
						.map((id) => getShapeLabel(editor, id))
						.filter((label) => label && !label.startsWith('shape:'))
					const { mermaid } = await fetchGeneratedMermaid({
						prompt,
						mode: 'replace',
						shapeLabels: shapeLabels.length ? shapeLabels : undefined,
						bounds: bounds
							? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
							: undefined,
						refs,
						movementContext: options?.movementContext,
					})
					const layer = addLayer({
						id: newLayerId(),
						name: prompt.slice(0, 40),
						shapeIds: [],
						prompt,
					})
					const result = await replaceInBounds(editor, selectedIds, mermaid, layer)
					if (!result.ok) {
						if (!options?.quiet) setStatus(result.reason, 'error')
						return
					}
					updateLayerShapeIds(layer.id, result.shapeIds)
					if (!options?.quiet) setStatus('Selection updated', 'success')
				} else {
					const { mermaid } = await fetchGeneratedMermaid({
						prompt,
						mode: 'generate',
						refs,
						movementContext: options?.movementContext,
					})
					const layer = addLayer({
						id: newLayerId(),
						name: prompt.slice(0, 40),
						shapeIds: [],
						prompt,
					})
					const shapeIds = await applyMermaidWithLayer(editor, mermaid, layer)
					updateLayerShapeIds(layer.id, shapeIds)
					editor.zoomToFit({ animation: { duration: 320 } })
					if (!options?.quiet) setStatus('Ink applied', 'success')
				}
			} catch (e) {
				console.error(e)
				if (!options?.quiet) {
					setStatus(e instanceof Error ? e.message : 'Generation failed', 'error')
				}
			} finally {
				setInking(false)
			}
		},
		[addLayer, editor, isGenerating, selectedIds, setStatus, updateLayerShapeIds]
	)

	const cancel = useCallback(() => {
		agent.cancel()
		setInking(false)
		setStatus(null)
	}, [agent, setStatus])

	return {
		agent,
		submit,
		cancel,
		isGenerating,
		selectedIds,
		setStatus,
	}
}
