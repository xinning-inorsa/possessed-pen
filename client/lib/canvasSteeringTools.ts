import type { Editor } from 'tldraw'

/** Freehand tools — user steers with lasso/select; agent inks programmatically. */
const BLOCKED_FREEHAND_TOOLS = new Set(['draw', 'highlight'])

/** Switch off draw/highlight if persisted state or a shortcut left them active. */
export function ensureSteeringTool(editor: Editor) {
	const toolId = editor.getCurrentToolId()
	if (BLOCKED_FREEHAND_TOOLS.has(toolId)) {
		editor.setCurrentTool('select')
	}
}

/** Remove freehand tools from the tldraw UI tool map (drops d/b/x shortcuts too). */
export function stripFreehandTools<T extends Record<string, unknown>>(tools: T): T {
	const { draw: _draw, highlight: _highlight, ...rest } = tools as T & {
		draw?: unknown
		highlight?: unknown
	}
	return rest as T
}
