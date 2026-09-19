import { createMermaidDiagram } from '@tldraw/mermaid'
import { ApplyMermaidAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
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
			const origin = helpers.applyOffsetToVec({ x: 0, y: 0 })
			await createMermaidDiagram(editor, action.mermaid, {
				blueprintRender: {
					position: origin,
					centerOnPosition: false,
				},
			})
		}
	}
)
