export type MovementDwellRegion = {
	tMsStart: number
	tMsEnd: number
	durationMs: number
	shapeIds: string[]
	labels?: string[]
	/** Canvas point of the dwell — set even when shapeIds is empty. */
	pagePoint?: { x: number; y: number }
}

export type MovementCircledRegion = {
	tMsStart: number
	tMsEnd: number
	bounds: { x: number; y: number; w: number; h: number }
	shapeIds: string[]
	labels?: string[]
}

/** Pointer click (mouseup) during or shortly after the utterance. */
export type MovementClickRegion = {
	tMs: number
	shapeIds: string[]
	labels?: string[]
	/** Canvas point of the click — set even when shapeIds is empty. */
	pagePoint?: { x: number; y: number }
}

export type MovementContext = {
	hoveredShapeIds: string[]
	dwellRegions: MovementDwellRegion[]
	circledRegions: MovementCircledRegion[]
	clickRegions: MovementClickRegion[]
}
