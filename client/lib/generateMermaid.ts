import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { parseApiError } from './parseApiError'

export type GenerateMermaidRequest = {
	prompt: string
	mode: 'generate' | 'replace'
	shapeLabels?: string[]
	bounds?: { x: number; y: number; w: number; h: number }
	refs?: SpatialRef[]
	movementContext?: MovementContext
}

export type GenerateMermaidResponse = {
	mermaid: string
}

export async function fetchGeneratedMermaid(
	body: GenerateMermaidRequest
): Promise<GenerateMermaidResponse> {
	const response = await fetch('/api/generate-mermaid', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

	if (!response.ok) {
		const text = await response.text()
		throw new Error(parseApiError(text, `Generation failed (${response.status})`))
	}

	return response.json()
}
