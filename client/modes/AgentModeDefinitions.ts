import type { AgentAction } from '../../shared/types/AgentAction'
import type { PromptPart } from '../../shared/types/PromptPart'
import { ApplyMermaidActionUtil } from '../actions/ApplyMermaidActionUtil'
import { CreateActionUtil } from '../actions/CreateActionUtil'
import { DeleteActionUtil } from '../actions/DeleteActionUtil'
import { LabelActionUtil } from '../actions/LabelActionUtil'
import { MessageActionUtil } from '../actions/MessageActionUtil'
import { PlaceActionUtil } from '../actions/PlaceActionUtil'
import { ThinkActionUtil } from '../actions/ThinkActionUtil'
import { UnknownActionUtil } from '../actions/UnknownActionUtil'
import { UpdateActionUtil } from '../actions/UpdateActionUtil'
import { AgentViewportBoundsPartUtil } from '../parts/AgentViewportBoundsPartUtil'
import { BlurryShapesPartUtil } from '../parts/BlurryShapesPartUtil'
import { ContextItemsPartUtil } from '../parts/ContextItemsPartUtil'
import { DebugPartUtil } from '../parts/DebugPartUtil'
import { MessagesPartUtil } from '../parts/MessagesPartUtil'
import { ModelNamePartUtil } from '../parts/ModelNamePartUtil'
import { ModePartUtil } from '../parts/ModePartUtil'
import { PeripheralShapesPartUtil } from '../parts/PeripheralShapesPartUtil'
import { SelectedShapesPartUtil } from '../parts/SelectedShapesPartUtil'
import { TimePartUtil } from '../parts/TimePartUtil'
import { UserViewportBoundsPartUtil } from '../parts/UserViewportBoundsPartUtil'

export type AgentModeDefinition = {
	type: string
} & (
	| {
			active: true
			parts: PromptPart['type'][]
			actions: AgentAction['_type'][]
	  }
	| {
			active: false
	  }
)

export const AGENT_MODE_DEFINITIONS = [
	{
		type: 'idling',
		active: false,
	},
	{
		type: 'working',
		active: true,
		parts: [
			ModePartUtil.type,
			DebugPartUtil.type,
			ModelNamePartUtil.type,
			MessagesPartUtil.type,
			ContextItemsPartUtil.type,
			UserViewportBoundsPartUtil.type,
			AgentViewportBoundsPartUtil.type,
			BlurryShapesPartUtil.type,
			PeripheralShapesPartUtil.type,
			SelectedShapesPartUtil.type,
			TimePartUtil.type,
		],
		actions: [
			LabelActionUtil.type,
			DeleteActionUtil.type,
			CreateActionUtil.type,
			PlaceActionUtil.type,
			UpdateActionUtil.type,
			ApplyMermaidActionUtil.type,
			MessageActionUtil.type,
			ThinkActionUtil.type,
			UnknownActionUtil.type,
		] as AgentAction['_type'][],
	},
] as const satisfies AgentModeDefinition[]

export type AgentModeDefinitionType = (typeof AGENT_MODE_DEFINITIONS)[number]
export type AgentModeType = AgentModeDefinitionType['type']

export function getAgentModeDefinition(type: AgentModeType): AgentModeDefinitionType {
	const mode = AGENT_MODE_DEFINITIONS.find((m) => m.type === type)
	if (!mode) throw new Error(`Unknown agent mode: ${type}`)
	return mode
}
