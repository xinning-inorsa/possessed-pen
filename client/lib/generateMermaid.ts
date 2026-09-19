import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { parseApiError } from './parseApiError'
import { addThinkingStep } from './thinkingLog'

export type GenerateMermaidRequest = {
	prompt: string
	mode: 'generate' | 'replace'
	shapeLabels?: string[]
	bounds?: { x: number; y: number; w: number; h: number }
	refs?: SpatialRef[]
	movementContext?: MovementContext
}

export type GenerateMermaidDebug = {
	systemPrompt?: string
	userPrompt?: string
}

export type GenerateMermaidResponse = {
	mermaid: string
	debug?: GenerateMermaidDebug
}

export type FetchGeneratedMermaidOptions = {
	attemptId?: string
	debug?: boolean
}

export async function fetchGeneratedMermaid(
	body: GenerateMermaidRequest,
	options?: FetchGeneratedMermaidOptions
): Promise<GenerateMermaidResponse> {
	const attemptId = options?.attemptId
	const debug = options?.debug ?? import.meta.env.DEV
	const url = debug ? '/api/generate-mermaid?debug=1' : '/api/generate-mermaid'

	if (attemptId) {
		addThinkingStep(attemptId, {
			kind: 'api-request',
			title: 'POST /api/generate-mermaid',
			body,
		})
	}

	const startedAt = performance.now()

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

	const durationMs = Math.round(performance.now() - startedAt)

	if (!response.ok) {
		const text = await response.text()
		const message = parseApiError(text, `Generation failed (${response.status})`)
		if (attemptId) {
			addThinkingStep(attemptId, {
				kind: 'error',
				title: 'API error',
				error: message,
				body: { status: response.status, body: text },
				durationMs,
			})
		}
		throw new Error(message)
	}

	const data = (await response.json()) as GenerateMermaidResponse

	if (attemptId) {
		addThinkingStep(attemptId, {
			kind: 'api-response',
			title: 'Mermaid response',
			body: data,
			durationMs,
		})
	}

	return data
}
