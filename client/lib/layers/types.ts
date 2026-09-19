export type Layer = {
	id: string
	name: string
	createdAt: number
	shapeIds: string[]
	bounds?: { x: number; y: number; w: number; h: number }
	prompt?: string
	parentLayerId?: string
}

export const LAYER_META_KEY = 'layerId'
