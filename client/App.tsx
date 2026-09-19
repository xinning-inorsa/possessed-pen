import { useCallback, useMemo, useState } from 'react'
import {
	DefaultSizeStyle,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { PossessedPenChrome } from './components/PossessedPenChrome'
import { LayerProvider } from './layers/LayerContext'
import { AgentHighlightOverlayUtil } from './overlays/AgentHighlightOverlayUtil'
import { ensureSteeringTool, stripFreehandTools } from './lib/canvasSteeringTools'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import './components/possessed-pen.css'

DefaultSizeStyle.setDefaultValue('s')

const tldrawOptions = {
	camera: {
		wheelBehavior: 'zoom' as const,
	},
}

const tools = [TargetShapeTool, TargetAreaTool]
const overlayUtils = [AgentHighlightOverlayUtil]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...stripFreehandTools(tools),
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)

	const handleUnmount = useCallback(() => {
		setApp(null)
	}, [])

	const components: TLComponents = useMemo(() => {
		return {
			Toolbar: null,
			StylePanel: null,
			NavigationPanel: null,
			Minimap: null,
			HelpMenu: null,
			MainMenu: null,
			PageMenu: null,
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
		}
	}, [app])

	const agent = app?.agents.getAgent()

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container possessed-pen-layout">
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey="possessed-pen-demo"
						options={tldrawOptions}
						tools={tools}
						overlayUtils={overlayUtils}
						overrides={overrides}
						components={components}
						onMount={(editor) => {
							editor.user.updateUserPreferences({
								colorScheme: 'dark',
								inputMode: 'mouse',
							})
							ensureSteeringTool(editor)
						}}
					>
						<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
					</Tldraw>
				</div>
				{app && agent && (
					<TldrawAgentAppContextProvider app={app}>
						<LayerProvider>
							<PossessedPenChrome editor={agent.editor} />
						</LayerProvider>
					</TldrawAgentAppContextProvider>
				)}
			</div>
		</TldrawUiToastsProvider>
	)
}

export default App
