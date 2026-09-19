import ELK from 'elkjs/lib/elk.bundled.js'
import { Editor, TLShapeId } from 'tldraw'
import { buildCanvasTopology } from './buildCanvasTopology'
import { toSimpleShapeId } from './normalizeShapeId'

const elk = new ELK()

/** Vertical gap between layout tiers. */
const LAYER_GAP = 140
/** Horizontal gap between sibling nodes. */
const NODE_GAP = 100

function isLayoutNode(editor: Editor, id: TLShapeId): boolean {
	const shape = editor.getShape(id)
	return shape?.type === 'geo'
}

/**
 * Semi-interactive ELK layered layout over the edited cluster.
 * Seeds each node's current position so existing shapes stay put where possible
 * and new shapes get even spacing. Returns false when there is nothing to lay out.
 */
export async function elkTidyLayout(
	editor: Editor,
	createdIds: TLShapeId[],
	anchorIds: TLShapeId[] = []
): Promise<boolean> {
	const edges = buildCanvasTopology(editor)

	// Cluster: created geo nodes + wired anchors + 1-hop geo neighbors.
	const cluster = new Set<TLShapeId>()
	const createdGeo = createdIds.filter((id) => isLayoutNode(editor, id))
	if (createdGeo.length === 0) return false
	for (const id of createdGeo) cluster.add(id)

	const createdSimple = new Set(createdGeo.map((id) => String(toSimpleShapeId(id))))

	for (const anchorId of anchorIds) {
		if (!isLayoutNode(editor, anchorId)) continue
		const simple = String(toSimpleShapeId(anchorId))
		const connected = edges.some(
			(e) =>
				(e.fromId === simple && createdSimple.has(e.toId)) ||
				(e.toId === simple && createdSimple.has(e.fromId))
		)
		if (connected) cluster.add(anchorId)
	}

	for (const id of createdGeo) {
		const simple = String(toSimpleShapeId(id))
		for (const edge of edges) {
			for (const other of [edge.fromId, edge.toId]) {
				if (other === simple) continue
				if (edge.fromId !== simple && edge.toId !== simple) continue
				const neighborId = `shape:${other}` as TLShapeId
				if (isLayoutNode(editor, neighborId)) cluster.add(neighborId)
			}
		}
	}

	if (cluster.size < 2) return false

	const clusterSimple = new Set([...cluster].map((id) => String(toSimpleShapeId(id))))

	// Seed positions only as model-order hints (semiInteractive uses them for crossing
	// minimization), NOT as fixed positions — nodes must be free to spread apart.
	const children = [...cluster].map((id) => {
		const bounds = editor.getShapePageBounds(id)!
		const simple = String(toSimpleShapeId(id))
		return {
			id: simple,
			width: bounds.w,
			height: bounds.h,
		}
	})

	const elkEdges = edges
		.filter((e) => clusterSimple.has(String(e.fromId)) && clusterSimple.has(String(e.toId)))
		.map((e, i) => ({
			id: `e${i}`,
			sources: [String(e.fromId)],
			targets: [String(e.toId)],
		}))

	const graph = {
		id: 'root',
		layoutOptions: {
			'elk.algorithm': 'layered',
			'elk.direction': 'DOWN',
			// Interactive keeps relative order from the input model without pinning positions.
			'elk.interactiveLayout': 'true',
			'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
			'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
			'elk.spacing.nodeNode': String(NODE_GAP),
			// Separate same-layer nodes that would otherwise overlap.
			'elk.layered.spacing.edgeNodeBetweenLayers': String(NODE_GAP),
			'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
		},
		children,
		edges: elkEdges,
	}

	const result = await elk.layout(graph)

	for (const node of result.children ?? []) {
		if (node.x === undefined || node.y === undefined) continue
		const shapeId = `shape:${node.id}` as TLShapeId
		const shape = editor.getShape(shapeId)
		if (!shape) continue
		const bounds = editor.getShapePageBounds(shapeId)
		if (!bounds) continue
		const dx = node.x - bounds.x
		const dy = node.y - bounds.y
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
		editor.updateShape({ id: shapeId, type: shape.type, x: shape.x + dx, y: shape.y + dy })
	}

	return true
}
