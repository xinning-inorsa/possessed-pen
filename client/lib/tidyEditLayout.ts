import { Box, Editor, TLShapeId } from 'tldraw'
import { buildCanvasTopology, type TopologyEdge } from './buildCanvasTopology'
import { toSimpleShapeId } from './normalizeShapeId'

/** Minimum gap between stacked box bounds in a vertical replacement chain. */
export const VERTICAL_STACK_GAP = 140

/** Minimum gap between parallel fan-out branch bounds. */
export const HORIZONTAL_FANOUT_GAP = 100

export type TidyEditLayoutOptions = {
	/** Edit targets / anchor nodes to include when wired to new shapes. */
	anchorIds?: TLShapeId[]
}

/** Geo nodes (rectangles, diamonds, etc.) that participate in layout. */
function isLayoutNode(editor: Editor, id: TLShapeId): boolean {
	const shape = editor.getShape(id)
	return shape?.type === 'geo'
}

function existingLayoutNodes(editor: Editor, ids: TLShapeId[]): TLShapeId[] {
	return ids.filter((id) => isLayoutNode(editor, id))
}

/** Upstream parents outside the cluster (fan-out source, e.g. the load balancer's feeder). */
function getExternalUpstreamIds(
	edges: TopologyEdge[],
	simpleId: string,
	clusterSimple: ReadonlySet<string>
): string[] {
	return edges
		.filter((e) => e.toId === String(simpleId) && !clusterSimple.has(String(e.fromId)))
		.map((e) => e.fromId)
}

function inferDirectionFromBounds(editor: Editor, ids: TLShapeId[]): 'horizontal' | 'vertical' {
	const bounds = ids
		.map((id) => editor.getShapePageBounds(id))
		.filter((b): b is Box => b != null)
	if (bounds.length < 2) return 'vertical'

	const cluster = Box.Common(bounds)
	return cluster.width >= cluster.height ? 'horizontal' : 'vertical'
}

/**
 * Stack layout nodes individually using page bounds.
 * Unlike editor.stackShapes(), this ignores arrow bindings so vertical chains
 * still get even spacing when every box is wired together.
 */
function stackLayoutNodes(
	editor: Editor,
	ids: TLShapeId[],
	direction: 'horizontal' | 'vertical',
	gap: number
): void {
	const nodes = existingLayoutNodes(editor, ids)
		.map((id) => ({ id, bounds: editor.getShapePageBounds(id) }))
		.filter((entry): entry is { id: TLShapeId; bounds: Box } => entry.bounds != null)

	if (nodes.length < 2) return

	const vertical = direction === 'vertical'
	nodes.sort((a, b) =>
		vertical ? a.bounds.minY - b.bounds.minY : a.bounds.minX - b.bounds.minX
	)

	let edge = vertical ? nodes[0].bounds.maxY : nodes[0].bounds.maxX

	for (let i = 1; i < nodes.length; i++) {
		const { id, bounds } = nodes[i]
		const start = vertical ? bounds.minY : bounds.minX
		const delta = edge + gap - start

		if (delta > 0.5) {
			editor.nudgeShapes([id], vertical ? { x: 0, y: delta } : { x: delta, y: 0 })
			const moved = editor.getShapePageBounds(id)
			if (moved) {
				edge = vertical ? moved.maxY : moved.maxX
				continue
			}
		}

		edge = vertical ? bounds.maxY : bounds.maxX
	}
}

function groupSiblingFanOut(geoIds: TLShapeId[], edges: TopologyEdge[]): TLShapeId[][] {
	const byParent = new Map<string, TLShapeId[]>()

	for (const id of geoIds) {
		const simpleId = toSimpleShapeId(id)
		const parents = edges.filter((e) => e.toId === String(simpleId)).map((e) => e.fromId)
		if (parents.length !== 1) continue
		const key = parents[0]
		const list = byParent.get(key) ?? []
		list.push(id)
		byParent.set(key, list)
	}

	return [...byParent.values()].filter((group) => group.length >= 2)
}

function groupParallelFanOut(
	geoIds: TLShapeId[],
	edges: TopologyEdge[],
	clusterSimple: ReadonlySet<string>
): TLShapeId[][] {
	const byUpstream = new Map<string, TLShapeId[]>()

	for (const id of geoIds) {
		const simpleId = toSimpleShapeId(id)
		const upstreams = getExternalUpstreamIds(edges, simpleId, clusterSimple)
		if (upstreams.length !== 1) continue
		const key = upstreams[0]
		const list = byUpstream.get(key) ?? []
		list.push(id)
		byUpstream.set(key, list)
	}

	return [...byUpstream.values()].filter((group) => group.length >= 2)
}

function findVerticalChain(editor: Editor, geoIds: TLShapeId[], edges: TopologyEdge[]): TLShapeId[] {
	const simpleIds = new Set(geoIds.map((id) => String(toSimpleShapeId(id))))
	const internal = edges.filter(
		(e) => simpleIds.has(String(e.fromId)) && simpleIds.has(String(e.toId))
	)
	if (internal.length === 0) {
		return [...geoIds].sort((a, b) => {
			const ba = editor.getShapePageBounds(a)
			const bb = editor.getShapePageBounds(b)
			return (ba?.minY ?? 0) - (bb?.minY ?? 0)
		})
	}

	const inboundFromCluster = new Map<string, number>()
	for (const edge of internal) {
		inboundFromCluster.set(edge.toId, (inboundFromCluster.get(edge.toId) ?? 0) + 1)
	}

	const heads = [...simpleIds].filter((id) => !inboundFromCluster.has(id))
	const head = heads.sort((a, b) => {
		const ba = editor.getShapePageBounds(`shape:${a}` as TLShapeId)
		const bb = editor.getShapePageBounds(`shape:${b}` as TLShapeId)
		return (ba?.minY ?? 0) - (bb?.minY ?? 0)
	})[0] ?? [...simpleIds][0]

	const outgoing = new Map<string, string>()
	for (const edge of internal) {
		outgoing.set(edge.fromId, edge.toId)
	}

	const ordered: TLShapeId[] = []
	const seen = new Set<string>()
	let current: string | undefined = head
	while (current && !seen.has(current)) {
		seen.add(current)
		ordered.push(`shape:${current}` as TLShapeId)
		current = outgoing.get(current)
	}

	for (const id of geoIds) {
		if (!seen.has(String(toSimpleShapeId(id)))) ordered.push(id)
	}

	return ordered
}

/** Collect created layout nodes plus wired anchors and immediate neighbors. */
function collectLayoutClusterIds(
	editor: Editor,
	createdIds: TLShapeId[],
	anchorIds: TLShapeId[],
	edges: TopologyEdge[]
): TLShapeId[] {
	const layoutCreated = existingLayoutNodes(editor, createdIds)
	if (layoutCreated.length === 0) return []

	const cluster = new Set<TLShapeId>(layoutCreated)
	const createdSimple = new Set(layoutCreated.map((id) => String(toSimpleShapeId(id))))

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

	for (const id of layoutCreated) {
		const simple = String(toSimpleShapeId(id))
		for (const edge of edges) {
			if (edge.fromId === simple) {
				const neighborId = `shape:${edge.toId}` as TLShapeId
				if (isLayoutNode(editor, neighborId)) cluster.add(neighborId)
			}
			if (edge.toId === simple) {
				const neighborId = `shape:${edge.fromId}` as TLShapeId
				if (isLayoutNode(editor, neighborId)) cluster.add(neighborId)
			}
		}
	}

	return [...cluster]
}

function shapesOverlap(editor: Editor, a: TLShapeId, b: TLShapeId): boolean {
	const ba = editor.getShapePageBounds(a)
	const bb = editor.getShapePageBounds(b)
	if (!ba || !bb) return false
	return ba.collides(bb)
}

function overlapsAnyInCluster(editor: Editor, id: TLShapeId, cluster: TLShapeId[]): boolean {
	for (const other of cluster) {
		if (other === id) continue
		if (shapesOverlap(editor, id, other)) return true
	}
	return false
}

/** Downstream geo nodes from created boxes should shift when fan-out expands above them. */
function downstreamFromCreated(
	createdSimple: ReadonlySet<string>,
	clusterSimple: ReadonlySet<string>,
	edges: TopologyEdge[]
): Set<string> {
	const reachable = new Set<string>(createdSimple)
	const queue = [...createdSimple]
	while (queue.length) {
		const from = queue.shift()!
		for (const edge of edges) {
			if (edge.fromId !== from || !clusterSimple.has(edge.toId)) continue
			if (reachable.has(edge.toId)) continue
			reachable.add(edge.toId)
			queue.push(edge.toId)
		}
	}
	return reachable
}

/** Longest-path tier assignment from in-cluster edges (merge nodes sit below all parents). */
function computeTiers(
	clusterSimple: ReadonlySet<string>,
	edges: TopologyEdge[]
): Map<string, number> {
	const internal = edges.filter(
		(e) => clusterSimple.has(String(e.fromId)) && clusterSimple.has(String(e.toId))
	)

	const tier = new Map<string, number>()
	for (const id of clusterSimple) tier.set(id, 0)

	if (internal.length === 0) return tier

	let changed = true
	while (changed) {
		changed = false
		for (const edge of internal) {
			const next = tier.get(edge.fromId)! + 1
			if (next > tier.get(edge.toId)!) {
				tier.set(edge.toId, next)
				changed = true
			}
		}
	}

	return tier
}

function getParentSimpleIds(
	simpleId: string,
	edges: TopologyEdge[],
	clusterSimple: ReadonlySet<string>
): string[] {
	return edges
		.filter((e) => e.toId === simpleId && clusterSimple.has(String(e.fromId)))
		.map((e) => e.fromId)
}

function tierBounds(editor: Editor, ids: TLShapeId[]): Box | null {
	const boxes = ids
		.map((id) => editor.getShapePageBounds(id))
		.filter((b): b is Box => b != null)
	return boxes.length ? Box.Common(boxes) : null
}

function centerShapeUnderBounds(editor: Editor, shapeId: TLShapeId, target: Box): void {
	const bounds = editor.getShapePageBounds(shapeId)
	if (!bounds) return
	const deltaX = target.midX - bounds.midX
	if (Math.abs(deltaX) > 0.5) {
		editor.nudgeShapes([shapeId], { x: deltaX, y: 0 })
	}
}

/**
 * Tier-aware layout for common edit patterns (LB fan-out → merge → sibling fan-out).
 * Pins untouched neighbors unless they overlap new boxes.
 */
function layoutClusterByTiers(
	editor: Editor,
	geoIds: TLShapeId[],
	edges: TopologyEdge[],
	createdSimple: ReadonlySet<string>
): void {
	const clusterSimple = new Set(geoIds.map((id) => String(toSimpleShapeId(id))))
	const tiers = computeTiers(clusterSimple, edges)

	const downstream = downstreamFromCreated(createdSimple, clusterSimple, edges)
	const movable = new Set<TLShapeId>()
	for (const id of geoIds) {
		const simple = String(toSimpleShapeId(id))
		if (
			createdSimple.has(simple) ||
			downstream.has(simple) ||
			overlapsAnyInCluster(editor, id, geoIds)
		) {
			movable.add(id)
		}
	}

	const byTier = new Map<number, TLShapeId[]>()
	for (const id of geoIds) {
		const simple = String(toSimpleShapeId(id))
		const tier = tiers.get(simple) ?? 0
		const list = byTier.get(tier) ?? []
		list.push(id)
		byTier.set(tier, list)
	}

	const sortedTiers = [...byTier.keys()].sort((a, b) => a - b)
	let prevMaxY: number | null = null

	for (const tierNum of sortedTiers) {
		const tierNodes = byTier.get(tierNum)!
		const movableInTier = tierNodes.filter((id) => movable.has(id))

		if (movableInTier.length >= 2) {
			stackLayoutNodes(editor, movableInTier, 'horizontal', HORIZONTAL_FANOUT_GAP)
		} else if (movableInTier.length === 1) {
			const simple = String(toSimpleShapeId(movableInTier[0]))
			const parents = getParentSimpleIds(simple, edges, clusterSimple)
			if (parents.length >= 2) {
				const parentBounds = tierBounds(
					editor,
					parents.map((p) => `shape:${p}` as TLShapeId)
				)
				if (parentBounds) centerShapeUnderBounds(editor, movableInTier[0], parentBounds)
			}
		}

		const bounds = tierBounds(editor, tierNodes)
		if (bounds && prevMaxY !== null) {
			const targetMinY = prevMaxY + VERTICAL_STACK_GAP
			const delta = targetMinY - bounds.minY
			if (delta > 0.5) {
				const toMove = tierNodes.filter((id) => movable.has(id))
				if (toMove.length) editor.nudgeShapes(toMove, { x: 0, y: delta })
			}
		}

		const after = tierBounds(editor, tierNodes)
		if (after) prevMaxY = after.maxY
	}
}

/**
 * Even out spacing among agent-created boxes after a surgical edit.
 * Uses page bounds; safe before or after reparent (page position preserved).
 */
export function tidyEditLayout(
	editor: Editor,
	createdIds: TLShapeId[],
	options: TidyEditLayoutOptions = {}
): void {
	const edges = buildCanvasTopology(editor)
	const geoIds = collectLayoutClusterIds(editor, createdIds, options.anchorIds ?? [], edges)
	if (geoIds.length < 2) return

	const createdSimple = new Set(
		existingLayoutNodes(editor, createdIds).map((id) => String(toSimpleShapeId(id)))
	)

	layoutClusterByTiers(editor, geoIds, edges, createdSimple)

	const clusterSimple = new Set(geoIds.map((id) => String(toSimpleShapeId(id))))
	const handled = new Set<TLShapeId>()

	for (const group of groupSiblingFanOut(geoIds, edges)) {
		const downstream = downstreamFromCreated(createdSimple, clusterSimple, edges)
		const movable = group.filter((id) => {
			const simple = String(toSimpleShapeId(id))
			return (
				createdSimple.has(simple) ||
				downstream.has(simple) ||
				overlapsAnyInCluster(editor, id, geoIds)
			)
		})
		if (movable.length >= 2) {
			stackLayoutNodes(editor, movable, 'horizontal', HORIZONTAL_FANOUT_GAP)
		}
		for (const id of group) handled.add(id)
	}

	for (const group of groupParallelFanOut(geoIds, edges, clusterSimple)) {
		const downstream = downstreamFromCreated(createdSimple, clusterSimple, edges)
		const movable = group.filter((id) => {
			const simple = String(toSimpleShapeId(id))
			return (
				createdSimple.has(simple) ||
				downstream.has(simple) ||
				overlapsAnyInCluster(editor, id, geoIds)
			)
		})
		if (movable.length >= 2) {
			stackLayoutNodes(editor, movable, 'horizontal', HORIZONTAL_FANOUT_GAP)
		}
		for (const id of group) handled.add(id)
	}

	const remaining = geoIds.filter((id) => !handled.has(id))
	const downstream = downstreamFromCreated(createdSimple, clusterSimple, edges)
	const remainingMovable = remaining.filter((id) => {
		const simple = String(toSimpleShapeId(id))
		return (
			createdSimple.has(simple) ||
			downstream.has(simple) ||
			overlapsAnyInCluster(editor, id, geoIds)
		)
	})

	if (remainingMovable.length >= 2) {
		const hasInternalLinks = edges.some(
			(e) => clusterSimple.has(String(e.fromId)) && clusterSimple.has(String(e.toId))
		)
		if (hasInternalLinks) {
			stackLayoutNodes(
				editor,
				findVerticalChain(editor, remainingMovable, edges),
				'vertical',
				VERTICAL_STACK_GAP
			)
		} else {
			const direction = inferDirectionFromBounds(editor, remainingMovable)
			stackLayoutNodes(
				editor,
				remainingMovable,
				direction,
				direction === 'vertical' ? VERTICAL_STACK_GAP : HORIZONTAL_FANOUT_GAP
			)
		}
	}
}
