import { TLShapeId } from 'tldraw'

/** Per-prompt context for edit calls (layer + replace targets for apply_mermaid fallback). */
export type EditSession = {
	layerId: string
	replaceShapeIds: TLShapeId[]
}

let current: EditSession | null = null

export function setEditSession(session: EditSession | null) {
	current = session
}

export function getEditSession(): EditSession | null {
	return current
}
