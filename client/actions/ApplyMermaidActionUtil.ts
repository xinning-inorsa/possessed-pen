import { createMermaidDiagram } from '@tldraw/mermaid'
import { TLShapeId } from 'tldraw'
import { ApplyMermaidAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { getEditSession } from '../lib/editSession'
import { applyMermaidWithLayer } from '../mermaid/applyMermaidWithLayer'
import { replaceInBounds } from '../mermaid/replaceInBounds'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const ApplyMermaidActionUtil = registerActionUtil(
	class ApplyMermaidActionUtil extends AgentActionUtil<ApplyMermaidAction> {
		static override type = 'apply_mermaid' as const

		override getInfo(action: Streaming<ApplyMermaidAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? 'Apply Mermaid diagram',
			}
		}

		override async applyAction(action: Streaming<ApplyMermaidAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.mermaid?.trim()) return
			const { editor } = this
			const session = getEditSession()
			const replaceIds =
				session?.replaceShapeIds?.length
					? session.replaceShapeIds
					: (editor.getSelectedShapeIds() as TLShapeId[])

			if (replaceIds.length > 0 && session?.layerId) {
				const result = await replaceInBounds(editor, replaceIds, action.mermaid, {
					id: session.layerId,
				})
				if (!result.ok) {
					console.error('apply_mermaid replace failed:', result.reason)
				}
				return
			}

			const origin = helpers.applyOffsetToVec({ x: 0, y: 0 })
			const layerId = session?.layerId
			if (layerId) {
				await applyMermaidWithLayer(
					editor,
					action.mermaid,
					{ id: layerId },
					{
						position: origin,
						centerOnPosition: false,
					}
				)
				return
			}

			await createMermaidDiagram(editor, action.mermaid, {
				blueprintRender: {
					position: origin,
					centerOnPosition: false,
				},
			})
		}
	}
)
