import type { FocusedGeoShape } from '../../shared/format/FocusedShape'
import type { SimpleShapeId } from '../../shared/types/ids-schema'

export type NativeConnection = {
	from: SimpleShapeId
	to: SimpleShapeId
	text?: string
}

export type NativeDiagram = {
	nodes: FocusedGeoShape[]
	connections: NativeConnection[]
}

/** Auth flow topology — same as client/seed/authFlow.mmd, as native tldraw geo shapes. */
export const AUTH_FLOW_NATIVE: NativeDiagram = {
	nodes: [
		{
			_type: 'ellipse',
			shapeId: 'auth-user' as SimpleShapeId,
			x: 216,
			y: 0,
			w: 128,
			h: 64,
			text: 'User',
			color: 'black',
			fill: 'none',
			note: '',
			textAlign: 'middle',
		},
		{
			_type: 'rectangle',
			shapeId: 'auth-gateway' as SimpleShapeId,
			x: 180,
			y: 100,
			w: 200,
			h: 72,
			text: 'API Gateway',
			color: 'black',
			fill: 'none',
			note: '',
			textAlign: 'middle',
		},
		{
			_type: 'diamond',
			shapeId: 'auth-service' as SimpleShapeId,
			x: 190,
			y: 220,
			w: 180,
			h: 100,
			text: 'Auth Service',
			color: 'black',
			fill: 'none',
			note: '',
			textAlign: 'middle',
		},
		{
			_type: 'rectangle',
			shapeId: 'auth-app' as SimpleShapeId,
			x: 40,
			y: 380,
			w: 180,
			h: 72,
			text: 'Application',
			color: 'black',
			fill: 'none',
			note: '',
			textAlign: 'middle',
		},
		{
			_type: 'rectangle',
			shapeId: 'auth-error' as SimpleShapeId,
			x: 340,
			y: 380,
			w: 180,
			h: 72,
			text: 'Error Response',
			color: 'black',
			fill: 'none',
			note: '',
			textAlign: 'middle',
		},
	],
	connections: [
		{ from: 'auth-user' as SimpleShapeId, to: 'auth-gateway' as SimpleShapeId },
		{ from: 'auth-gateway' as SimpleShapeId, to: 'auth-service' as SimpleShapeId },
		{
			from: 'auth-service' as SimpleShapeId,
			to: 'auth-app' as SimpleShapeId,
			text: 'valid token',
		},
		{
			from: 'auth-service' as SimpleShapeId,
			to: 'auth-error' as SimpleShapeId,
			text: 'invalid',
		},
	],
}
