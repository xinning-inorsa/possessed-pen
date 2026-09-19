import { useCallback, useState } from 'react'
import { Editor, TLShapeId, useValue } from 'tldraw'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { useLayers } from '../layers/LayerContext'
import { getShapeLabel } from '../lib/deixisResolver'
import { newLayerId } from '../lib/commandBarUtils'
import { buildEditAgentMessage } from '../lib/buildEditAgentMessage'
import { setEditSession } from '../lib/editSession'
import { fetchGeneratedMermaid } from '../lib/generateMermaid'
import {
	addThinkingStep,
	createThinkingAttempt,
	finishThinkingAttempt,
} from '../lib/thinkingLog'
import { shouldRestructureCluster } from '../lib/shouldRestructureCluster'
import { applyMermaidWithLayer } from '../mermaid/applyMermaidWithLayer'
import { getSelectionBounds, replaceInBounds } from '../mermaid/replaceInBounds'

export type CommandStatus = {
	message: string | null
	variant: 'inking' | 'success' | 'error'
	onEndCall?: () => void
}

function collectTargetShapeIds(
	selectedIds: TLShapeId[],
	refs?: SpatialRef[]
): TLShapeId[] {
	const ids = new Set<TLShapeId>(selectedIds)
	if (refs) {
		for (const ref of refs) {
			for (const id of ref.shapeIds) {
				ids.add(id as TLShapeId)
			}
		}
	}
	return [...ids]
}

function tagShapesWithLayer(editor: Editor, shapeIds: TLShapeId[], layerId: string) {
	for (const id of shapeIds) {
		const shape = editor.getShape(id)
		if (!shape) continue
		editor.updateShape({
			id,
			type: shape.type,
			meta: { ...shape.meta, layerId },
		})
	}
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

	const runClusterReplace = useCallback(
		async (
			prompt: string,
			targetIds: TLShapeId[],
			options: {
				refs?: SpatialRef[]
				movementContext?: MovementContext
				attemptId: string
				quiet?: boolean
			}
		) => {
			const bounds = getSelectionBounds(editor, targetIds)
			const shapeLabels = targetIds
				.map((id) => getShapeLabel(editor, id))
				.filter((label) => label && !label.startsWith('shape:'))
			const { mermaid } = await fetchGeneratedMermaid(
				{
					prompt,
					mode: 'replace',
					shapeLabels: shapeLabels.length ? shapeLabels : undefined,
					bounds: bounds
						? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
						: undefined,
					refs: options.refs,
					movementContext: options.movementContext,
				},
				{ attemptId: options.attemptId }
			)
			const layer = addLayer({
				id: newLayerId(),
				name: prompt.slice(0, 40),
				shapeIds: [],
				prompt,
			})
			const result = await replaceInBounds(editor, targetIds, mermaid, layer)
			if (!result.ok) {
				addThinkingStep(options.attemptId, {
					kind: 'error',
					title: 'Replace failed',
					error: result.reason,
				})
				finishThinkingAttempt(options.attemptId, 'error')
				if (!options.quiet) setStatus(result.reason, 'error')
				return false
			}
			updateLayerShapeIds(layer.id, result.shapeIds)
			addThinkingStep(options.attemptId, {
				kind: 'ink',
				title: 'Cluster replaced',
				body: { shapeCount: result.shapeIds.length, layerId: layer.id },
			})
			finishThinkingAttempt(options.attemptId, 'ok')
			if (!options.quiet) setStatus('Selection updated', 'success')
			return true
		},
		[addLayer, editor, setStatus, updateLayerShapeIds]
	)

	const runSurgicalEdit = useCallback(
		async (
			prompt: string,
			targetIds: TLShapeId[],
			options: {
				refs?: SpatialRef[]
				movementContext?: MovementContext
				attemptId: string
				quiet?: boolean
			}
		) => {
			const layer = addLayer({
				id: newLayerId(),
				name: prompt.slice(0, 40),
				shapeIds: [],
				prompt,
			})

			const previousSelection = editor.getSelectedShapeIds()
			if (targetIds.length) {
				editor.select(...targetIds)
			}

			const bounds = getSelectionBounds(editor, targetIds) ?? editor.getViewportPageBounds()
			const message = buildEditAgentMessage(prompt, {
				editor,
				targetShapeIds: targetIds,
				refs: options.refs,
				movementContext: options.movementContext,
			})

			setEditSession({ layerId: layer.id, replaceShapeIds: targetIds })

			try {
				await agent.prompt({
					message,
					userMessages: [prompt],
					bounds,
					source: 'user',
				})
			} finally {
				setEditSession(null)
				if (previousSelection.length) {
					editor.select(...previousSelection)
				} else {
					editor.selectNone()
				}
			}

			const createdIds = agent.lints.getCreatedShapeIds()
			tagShapesWithLayer(editor, createdIds, layer.id)

			const layerShapeIds = editor
				.getCurrentPageShapes()
				.filter((s) => s.meta?.layerId === layer.id)
				.map((s) => s.id as string)
			updateLayerShapeIds(layer.id, layerShapeIds)

			addThinkingStep(options.attemptId, {
				kind: 'ink',
				title: 'Canvas patched',
				body: { shapeCount: layerShapeIds.length, layerId: layer.id },
			})
			finishThinkingAttempt(options.attemptId, 'ok')
			if (!options.quiet) setStatus('Updated', 'success')
			return true
		},
		[addLayer, agent, editor, setStatus, updateLayerShapeIds]
	)

	const submit = useCallback(
		async (
			text: string,
			refs?: SpatialRef[],
			options?: {
				quiet?: boolean
				movementContext?: MovementContext
				thinkingAttemptId?: string
			}
		) => {
			const prompt = text.trim()
			if (!prompt || isGenerating) return

			const attemptId = options?.thinkingAttemptId ?? createThinkingAttempt('ink')
			const targetIds = collectTargetShapeIds(selectedIds, refs)
			const isEdit = targetIds.length > 0

			setInking(true)
			if (!options?.quiet) {
				setStatus('Inking…', 'inking')
			}

			try {
				if (isEdit) {
					const restructure = shouldRestructureCluster(prompt)
					if (restructure) {
						await runClusterReplace(prompt, targetIds, {
							refs,
							movementContext: options?.movementContext,
							attemptId,
							quiet: options?.quiet,
						})
					} else {
						await runSurgicalEdit(prompt, targetIds, {
							refs,
							movementContext: options?.movementContext,
							attemptId,
							quiet: options?.quiet,
						})
					}
				} else {
					const request = {
						prompt,
						mode: 'generate' as const,
						refs,
						movementContext: options?.movementContext,
					}
					const { mermaid } = await fetchGeneratedMermaid(request, { attemptId })
					const layer = addLayer({
						id: newLayerId(),
						name: prompt.slice(0, 40),
						shapeIds: [],
						prompt,
					})
					const shapeIds = await applyMermaidWithLayer(editor, mermaid, layer)
					updateLayerShapeIds(layer.id, shapeIds)
					editor.zoomToFit({ animation: { duration: 320 } })
					addThinkingStep(attemptId, {
						kind: 'ink',
						title: 'Diagram applied',
						body: { shapeCount: shapeIds.length, layerId: layer.id },
					})
					finishThinkingAttempt(attemptId, 'ok')
					if (!options?.quiet) setStatus('Ink applied', 'success')
				}
			} catch (e) {
				console.error(e)
				const message = e instanceof Error ? e.message : 'Generation failed'
				addThinkingStep(attemptId, {
					kind: 'error',
					title: 'Ink failed',
					error: message,
				})
				finishThinkingAttempt(attemptId, 'error')
				if (!options?.quiet) {
					setStatus(message, 'error')
				}
			} finally {
				setInking(false)
			}
		},
		[
			addLayer,
			editor,
			isGenerating,
			runClusterReplace,
			runSurgicalEdit,
			selectedIds,
			setStatus,
			updateLayerShapeIds,
		]
	)

	const cancel = useCallback(() => {
		agent.cancel()
		setEditSession(null)
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
