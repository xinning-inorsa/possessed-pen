import { getBedrockLanguageModel } from '../bedrock'
import { generateText } from 'ai'
import { json, error, IRequest } from 'itty-router'
import type { MovementContext } from '../../shared/types/MovementContext'
import type { SpatialRef } from '../../shared/types/SpatialRef'
import { Environment } from '../environment'

const MERMAID_SYSTEM = `You emit Mermaid flowchart TD diagrams only. Rules:
- Output a single fenced \`\`\`mermaid block OR raw mermaid starting with flowchart TD
- Use rectangle nodes, decision diamonds {Question?}, and labeled edges
- Max 12 nodes, no absolute x/y coordinates, no styling directives
- Geo vocabulary only; no freehand, no classDef colors unless minimal`

type GenerateMermaidBody = {
	prompt?: string
	context?: string
	mode?: 'generate' | 'replace'
	shapeLabels?: string[]
	bounds?: { x: number; y: number; w: number; h: number }
	refs?: SpatialRef[]
	movementContext?: MovementContext
}

function buildRefsContext(refs: SpatialRef[]): string {
	return refs
		.map((ref) => {
			const labels = ref.labels?.length ? ref.labels.join(', ') : ref.shapeIds.join(', ')
			return `- "${ref.word}" refers to: ${labels}`
		})
		.join('\n')
}

function buildMovementContext(context: MovementContext): string {
	const lines: string[] = []
	if (context.hoveredShapeIds.length) {
		lines.push(`Hovered shapes during utterance: ${context.hoveredShapeIds.join(', ')}`)
	}
	for (const dwell of context.dwellRegions) {
		const labels = dwell.labels?.length ? dwell.labels.join(', ') : dwell.shapeIds.join(', ')
		lines.push(
			`- Dwell ${Math.round(dwell.durationMs)}ms on: ${labels}`
		)
	}
	for (const circle of context.circledRegions) {
		const labels = circle.labels?.length ? circle.labels.join(', ') : circle.shapeIds.join(', ')
		const { x, y, w, h } = circle.bounds
		lines.push(
			`- Circled region (${Math.round(w)}×${Math.round(h)} at ${Math.round(x)},${Math.round(y)}): ${labels}`
		)
	}
	for (const click of context.clickRegions ?? []) {
		const labels = click.labels?.length ? click.labels.join(', ') : click.shapeIds.join(', ')
		lines.push(`- Clicked: ${labels} (ids: ${click.shapeIds.join(', ')})`)
	}
	return lines.join('\n')
}

function buildContext(body: GenerateMermaidBody): string | undefined {
	const parts: string[] = []
	if (body.context?.trim()) parts.push(body.context.trim())
	if (body.mode === 'replace') {
		parts.push(
			'Replace only the selected shapes. Emit Mermaid for the same region; do not use absolute canvas coordinates.'
		)
		if (body.shapeLabels?.length) {
			parts.push(`Selected labels: ${body.shapeLabels.join(', ')}`)
		}
		if (body.bounds) {
			const { x, y, w, h } = body.bounds
			parts.push(`Selection bounds (page space): x=${x}, y=${y}, w=${w}, h=${h}`)
		}
	}
	if (body.refs?.length) {
		parts.push('Voice deictic references (pointer at utterance time):')
		parts.push(buildRefsContext(body.refs))
	}
	if (body.movementContext) {
		parts.push('Pointer movement context (hover, dwell, circled regions, clicks):')
		parts.push(buildMovementContext(body.movementContext))
	}
	return parts.length > 0 ? parts.join('\n') : undefined
}

export async function generateMermaid(request: IRequest, env: Environment) {
	let body: GenerateMermaidBody
	try {
		body = await request.json()
	} catch {
		return error(400, 'Invalid JSON body')
	}

	const prompt = body.prompt?.trim()
	if (!prompt) {
		return error(400, 'prompt is required')
	}

	const context = buildContext(body)
	const userPrompt = context ? `${context}\n\nUser request: ${prompt}` : prompt
	const debug = new URL(request.url).searchParams.get('debug') === '1'

	try {
		const { text } = await generateText({
			model: getBedrockLanguageModel(env),
			system: MERMAID_SYSTEM,
			prompt: userPrompt,
			temperature: 0,
		})

		const mermaid = extractMermaid(text)
		if (!mermaid) {
			return error(502, 'Model did not return valid Mermaid')
		}

		return json({
			mermaid,
			...(debug ? { debug: { systemPrompt: MERMAID_SYSTEM, userPrompt } } : {}),
		})
	} catch (e) {
		console.error('generate-mermaid error', e)
		const message =
			e instanceof Error ? e.message : 'Failed to generate Mermaid'
		return error(502, message)
	}
}

function extractMermaid(text: string): string | null {
	const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i)
	if (fenced?.[1]?.trim()) {
		return normalizeMermaid(fenced[1])
	}
	const idx = text.search(/flowchart\s+(TD|LR|BT|RL)/i)
	if (idx >= 0) {
		return normalizeMermaid(text.slice(idx))
	}
	return null
}

function normalizeMermaid(raw: string): string {
	const lines = raw
		.trim()
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
	if (!lines[0]?.match(/^flowchart/i)) {
		return `flowchart TD\n${lines.join('\n')}`
	}
	return lines.join('\n')
}
