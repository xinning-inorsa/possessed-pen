import { TLBindingId, TLShape } from 'tldraw'
import {
	convertFocusedShapeToTldrawShape,
	convertSimpleIdToTldrawId,
} from '../../shared/format/convertFocusedShapeToTldrawShape'
import { convertTldrawShapeToFocusedType } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { FocusedShape } from '../../shared/format/FocusedShape'
import { UpdateAction } from '../../shared/schema/AgentActionSchemas'
import { toSimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

function resolveFocusedUpdate(
	partial: Record<string, unknown>,
	shapeId: FocusedShape['shapeId'],
	existingShape: TLShape
): FocusedShape {
	const record: Record<string, unknown> = { ...partial, shapeId }
	if (typeof record._type === 'string' && record._type) {
		return record as FocusedShape
	}
	return {
		...record,
		_type: convertTldrawShapeToFocusedType(existingShape),
	} as FocusedShape
}

export const UpdateActionUtil = registerActionUtil(
	class UpdateActionUtil extends AgentActionUtil<UpdateAction> {
		static override type = 'update' as const

		override getInfo(action: Streaming<UpdateAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<UpdateAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const partialUpdate = action.update as Record<string, unknown>

			// Ensure the shape ID refers to a real shape
			const shapeId = helpers.ensureShapeIdExists(
				toSimpleShapeId(String(partialUpdate.shapeId ?? ''))
			)
			if (!shapeId) return null

			const existingShape = this.editor.getShape(convertSimpleIdToTldrawId(shapeId))
			if (!existingShape) return null

			let resolvedUpdate = resolveFocusedUpdate(partialUpdate, shapeId, existingShape)

			// If it's an arrow, ensure the from and to IDs refer to real shapes
			if (resolvedUpdate._type === 'arrow') {
				if (resolvedUpdate.fromId) {
					resolvedUpdate.fromId = helpers.ensureShapeIdExists(resolvedUpdate.fromId)
				}
				if (resolvedUpdate.toId) {
					resolvedUpdate.toId = helpers.ensureShapeIdExists(resolvedUpdate.toId)
				}

				if ('x1' in resolvedUpdate) {
					resolvedUpdate.x1 = helpers.ensureValueIsNumber(resolvedUpdate.x1) ?? 0
				}
				if ('y1' in resolvedUpdate) {
					resolvedUpdate.y1 = helpers.ensureValueIsNumber(resolvedUpdate.y1) ?? 0
				}
				if ('x2' in resolvedUpdate) {
					resolvedUpdate.x2 = helpers.ensureValueIsNumber(resolvedUpdate.x2) ?? 0
				}
				if ('y2' in resolvedUpdate) {
					resolvedUpdate.y2 = helpers.ensureValueIsNumber(resolvedUpdate.y2) ?? 0
				}
				if ('bend' in resolvedUpdate) {
					resolvedUpdate.bend = helpers.ensureValueIsNumber(resolvedUpdate.bend) ?? 0
				}
			}

			action.update = helpers.unroundShape(resolvedUpdate)

			return action
		}

		override applyAction(action: Streaming<UpdateAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			const { editor } = this

			// Translate the shape back to the chat's position
			action.update = helpers.removeOffsetFromShape(action.update)

			const shapeId = convertSimpleIdToTldrawId(action.update.shapeId)
			const existingShape = editor.getShape(shapeId)

			if (!existingShape) return

			const focusedUpdate = resolveFocusedUpdate(
				action.update as Record<string, unknown>,
				action.update.shapeId,
				existingShape
			)

			const result = convertFocusedShapeToTldrawShape(editor, focusedUpdate, {
				defaultShape: existingShape,
			})
			if (!result?.shape) return

			editor.updateShape(result.shape)

			// Handle arrow bindings if they exist
			if (result.bindings) {
				// First, clean up existing bindings
				const existingBindings = editor.getBindingsFromShape(shapeId, 'arrow')
				for (const binding of existingBindings) {
					editor.deleteBinding(binding.id as TLBindingId)
				}

				// Create new bindings
				for (const binding of result.bindings) {
					editor.createBinding({
						type: binding.type,
						fromId: binding.fromId,
						toId: binding.toId,
						props: binding.props,
						meta: binding.meta,
					})
				}
			}
		}
	}
)
