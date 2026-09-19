import { Editor, TLArrowBinding, TLShape, TLShapeId } from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { getShapeLabel } from './deixisResolver'

/** Arrow label lives in props.richText (create path) — fall back to meta.text. */
function getArrowLabel(editor: Editor, shape: TLShape): string | undefined {
	try {
		const text = editor.getShapeUtil(shape).getText(shape)
		if (typeof text === 'string' && text.trim()) return text.trim()
	} catch {
		// fall through to meta
	}
	const metaText = shape.meta?.text
	if (typeof metaText === 'string' && metaText.trim()) return metaText.trim()
	return undefined
}

export type TopologyEdge = {
	fromId: string
	fromLabel: string
	toId: string
	toLabel: string
	arrowLabel?: string
}

export function buildCanvasTopology(editor: Editor): TopologyEdge[] {
	const edges: TopologyEdge[] = []
	const bindings = editor.store.query.records('binding').get()

	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== 'arrow') continue

		const arrowBindings = bindings.filter(
			(b) => b.type === 'arrow' && b.fromId === shape.id
		) as TLArrowBinding[]
		const startBinding = arrowBindings.find((b) => b.props.terminal === 'start')
		const endBinding = arrowBindings.find((b) => b.props.terminal === 'end')
		if (!startBinding || !endBinding) continue

		const fromId = convertTldrawIdToSimpleId(startBinding.toId)
		const toId = convertTldrawIdToSimpleId(endBinding.toId)
		const arrowLabel = getArrowLabel(editor, shape)

		edges.push({
			fromId,
			fromLabel: getShapeLabel(editor, `shape:${fromId}` as TLShapeId),
			toId,
			toLabel: getShapeLabel(editor, `shape:${toId}` as TLShapeId),
			arrowLabel,
		})
	}

	return edges
}

function formatDownstreamHints(edges: TopologyEdge[]): string {
	const byFrom = new Map<string, TopologyEdge[]>()
	for (const edge of edges) {
		const list = byFrom.get(edge.fromId) ?? []
		list.push(edge)
		byFrom.set(edge.fromId, list)
	}
	if (byFrom.size === 0) return ''

	const lines = ['## Downstream targets (wire replacements here)']
	for (const [fromId, outs] of byFrom) {
		const fromLabel = outs[0]?.fromLabel ?? fromId
		const targets = outs
			.map((o) => {
				const label = o.arrowLabel ? `"${o.arrowLabel}" → ` : '→ '
				return `${label}${o.toLabel} (${o.toId})`
			})
			.join('; ')
		lines.push(`- ${fromLabel} (${fromId}): ${targets}`)
	}
	return lines.join('\n')
}

export function formatTopologyMarkdown(edges: TopologyEdge[]): string {
	if (edges.length === 0) return 'No arrow connections on the canvas.'

	const edgeLines = edges.map((edge) => {
		const link = edge.arrowLabel
			? `${edge.fromLabel} --"${edge.arrowLabel}"--> ${edge.toLabel}`
			: `${edge.fromLabel} --> ${edge.toLabel}`
		return `- ${link} (from ${edge.fromId} → ${edge.toId})`
	})

	const downstream = formatDownstreamHints(edges)
	return ['## Edges', ...edgeLines, '', downstream].filter(Boolean).join('\n')
}
