import { Editor, RecordsDiff, TLRecord, TLShapeId } from 'tldraw'
import { getEditSession } from './editSession'
import { LAYER_META_KEY } from './layers/types'

/** Tag shapes added during a surgical edit with the active edit-session layer. */
export function tagDiffWithEditLayer(editor: Editor, diff: RecordsDiff<TLRecord>): void {
	const session = getEditSession()
	if (!session) return

	for (const [id, record] of Object.entries(diff.added)) {
		if (record.typeName !== 'shape') continue

		const shape = editor.getShape(id as TLShapeId)
		if (!shape) continue
		if (shape.meta?.[LAYER_META_KEY] === session.layerId) continue

		editor.updateShape({
			id: shape.id,
			type: shape.type,
			meta: { ...shape.meta, [LAYER_META_KEY]: session.layerId },
		})
	}
}
