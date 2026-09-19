import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import { TLShapeId } from 'tldraw'

/** Strip `shape:` prefix and brand as SimpleShapeId for ActionUtils. */
export function toSimpleShapeId(id: string): SimpleShapeId {
	const stripped = id.startsWith('shape:')
		? convertTldrawIdToSimpleId(id as TLShapeId)
		: id
	return stripped as SimpleShapeId
}

export function toSimpleShapeIds(ids: string[]): SimpleShapeId[] {
	return [...new Set(ids.map(toSimpleShapeId))]
}

/** Ensure a simple or prefixed id is a tldraw TLShapeId. */
export function toTldrawShapeId(id: string): TLShapeId {
	return (id.startsWith('shape:') ? id : `shape:${id}`) as TLShapeId
}
