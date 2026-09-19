import { Editor, TLShapeId } from 'tldraw'
import { convertTldrawShapeToBlurryShape } from '../../shared/format/convertTldrawShapeToBlurryShape'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { CanvasSnapshot } from '../../shared/types/CanvasSnapshot'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { AgentHelpers } from '../AgentHelpers'
import { buildShapeSpacingHints } from '../../shared/format/buildShapeSpacingHints'
import { buildCanvasTopology, formatTopologyMarkdown } from './buildCanvasTopology'

export async function buildCanvasSnapshot(
	editor: Editor,
	request: AgentRequest,
	helpers: AgentHelpers
): Promise<CanvasSnapshot> {
	// Full page inventory so the agent can review downstream (not just the selection box).
	const shapes = editor
		.getCurrentPageShapesSorted()
		.map((shape) => convertTldrawShapeToBlurryShape(editor, shape))
		.filter((s) => s !== null)
		.map((shape) => {
			const bounds = helpers.roundBox(
				helpers.applyOffsetToBox({
					x: shape.x,
					y: shape.y,
					w: shape.w,
					h: shape.h,
				})
			)
			return { ...shape, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
		})

	const selectionIds = editor
		.getSelectedShapeIds()
		.map((id) => convertTldrawIdToSimpleId(id as TLShapeId))

	const message = request.agentMessages.join('\n').trim()
	const topology = formatTopologyMarkdown(buildCanvasTopology(editor))

	// One viewport screenshot per request — read-only visual context for the model.
	let screenshotDataUrl: string | undefined
	const visibleIds = [...editor.getCurrentPageShapeIds()]
	if (visibleIds.length > 0) {
		try {
			const result = await editor.toImage(visibleIds, {
				format: 'png',
				background: true,
				padding: 32,
				scale: 1,
			})
			screenshotDataUrl = await blobToDataUrl(result.blob)
		} catch (error) {
			console.warn('viewport screenshot failed:', error)
		}
	}

	return {
		bounds: helpers.roundBox(helpers.applyOffsetToBox(request.bounds)),
		shapes,
		spacingHints: buildShapeSpacingHints(shapes),
		topology,
		selectionIds,
		deixis: request.spatialRefs ?? [],
		movement: request.movementContext,
		transcriptWords: request.transcriptWords,
		screenshotDataUrl,
		request: message,
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}
