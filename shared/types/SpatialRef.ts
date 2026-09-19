export type SpatialRef = {
	word: string
	shapeIds: string[]
	labels?: string[]
	/** Canvas point for location deixis ("here/there") when no shape was hit. */
	pagePoint?: { x: number; y: number }
}
