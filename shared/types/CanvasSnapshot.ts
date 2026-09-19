import type { BoxModel } from 'tldraw'
import type { BlurryShape } from '../format/BlurryShape'
import type { MovementContext } from './MovementContext'
import type { SpatialRef } from './SpatialRef'
import type { TranscriptWord } from './TranscriptWord'

/** Canvas context seeded into the Deep Agent virtual filesystem at run start. */
export type CanvasSnapshot = {
	bounds: BoxModel
	shapes: BlurryShape[]
	/** Overlap / tight-gap hints derived from shapes (viewport coordinates). */
	spacingHints: string
	/** Arrow edges for the full current page (chart topology). */
	topology: string
	selectionIds: string[]
	deixis: SpatialRef[]
	movement?: MovementContext
	/** Word-level transcript timings for the word↔gesture timeline. */
	transcriptWords?: TranscriptWord[]
	/** One viewport screenshot per request (data URL) — read-only visual context. */
	screenshotDataUrl?: string
	request: string
}

export type CanvasToolResult = {
	ok: boolean
	error?: string
	shapes?: BlurryShape[]
	/** Fresh edge list after the mutation so the agent can verify connections. */
	topology?: string
}
