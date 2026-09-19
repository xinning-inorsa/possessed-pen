import { DefaultHelperButtons, TldrawUiMenuContextProvider } from 'tldraw'
import { GoToAgentButtons } from './GoToAgentButton'

export function CustomHelperButtons() {
	return (
		<DefaultHelperButtons>
			<TldrawUiMenuContextProvider type="helper-buttons" sourceId="helper-buttons">
				<GoToAgentButtons />
			</TldrawUiMenuContextProvider>
		</DefaultHelperButtons>
	)
}
