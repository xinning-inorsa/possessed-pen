export type MovementDwellRegion = {
	tMsStart: number
	tMsEnd: number
	durationMs: number
	shapeIds: string[]
	labels?: string[]
}

export type MovementCircledRegion = {
	tMsStart: number
	tMsEnd: number
	bounds: { x: number; y: number; w: number; h: number }
	shapeIds: string[]
	labels?: string[]
}

export type MovementContext = {
	hoveredShapeIds: string[]
	dwellRegions: MovementDwellRegion[]
	circledRegions: MovementCircledRegion[]
}
