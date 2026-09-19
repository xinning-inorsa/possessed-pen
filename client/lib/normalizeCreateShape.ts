import { FOCUSED_TO_GEO_TYPES } from '../../shared/format/convertFocusedShapeToTldrawShape'
import {
	getFocusedShapeSchemaNames,
	type FocusedShape,
} from '../../shared/format/FocusedShape'

const VALID_TYPES = new Set(getFocusedShapeSchemaNames())

const TYPE_ALIASES: Record<string, FocusedShape['_type']> = {
	box: 'rectangle',
	rect: 'rectangle',
	geo: 'rectangle',
	node: 'rectangle',
	component: 'rectangle',
}

function isGeoType(type: string): type is FocusedShape['_type'] {
	return type in FOCUSED_TO_GEO_TYPES
}

/** Fill in missing fields so create+place can add one new labeled box or arrow. */
export function normalizeCreateShape(
	raw: unknown,
	intent: string,
	defaultPosition?: { x: number; y: number }
): Record<string, unknown> | null {
	if (!raw || typeof raw !== 'object') return null

	const shape = { ...(raw as Record<string, unknown>) }
	const rawType = typeof shape._type === 'string' ? shape._type : ''
	const normalizedType =
		TYPE_ALIASES[rawType.toLowerCase()] ?? (rawType as FocusedShape['_type'])

	if (!normalizedType || !VALID_TYPES.has(normalizedType)) return null
	shape._type = normalizedType

	if (typeof shape.shapeId !== 'string' || !shape.shapeId.trim()) {
		shape.shapeId = `new-${crypto.randomUUID().slice(0, 8)}`
	}

	const label =
		(typeof shape.text === 'string' && shape.text.trim()) ||
		(typeof shape.label === 'string' && shape.label.trim()) ||
		intent.trim()

	if (isGeoType(normalizedType)) {
		shape.x ??= defaultPosition?.x ?? 0
		shape.y ??= defaultPosition?.y ?? 0
		shape.w ??= 168
		shape.h ??= 72
		shape.color ??= 'black'
		shape.fill ??= 'none'
		shape.note ??= ''
		shape.textAlign ??= 'middle'
		if (label) shape.text = label
	}

	if (normalizedType === 'arrow') {
		shape.color ??= 'black'
		shape.note ??= ''
		shape.bend ??= 0
		shape.x1 ??= 0
		shape.y1 ??= 0
		shape.x2 ??= 100
		shape.y2 ??= 0
	}

	if (normalizedType === 'text') {
		shape.x ??= defaultPosition?.x ?? 0
		shape.y ??= defaultPosition?.y ?? 0
		shape.anchor ??= 'top-left'
		shape.color ??= 'black'
		shape.note ??= ''
		shape.maxWidth ??= null
		if (label) shape.text = label
	}

	return shape
}
