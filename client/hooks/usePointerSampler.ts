import { Editor, TLShapeId } from 'tldraw'
import { useCallback, useRef } from 'react'
import {
	appendCircledRegion,
	appendDwellRegion,
	appendPointerSample,
	getActiveSpatialTranscriptSession,
} from '../lib/spatialTranscript'
import {
	createDwellTracker,
	detectCircledRegion,
	updateDwellTracker,
} from '../lib/pointerGestures'
import type { PointerEventType } from '../lib/spatialTranscript'

const SAMPLE_INTERVAL_MS = 33 // ~30Hz
const MOVE_THROTTLE_MS = 16 // ~60Hz cap for pointermove

export function usePointerSampler(editor: Editor) {
	const intervalRef = useRef<number | null>(null)
	const dwellTrackerRef = useRef(createDwellTracker())
	const lastMoveSampleRef = useRef(0)
	const lastCircleEndRef = useRef(-Infinity)
	const cleanupRef = useRef<(() => void) | null>(null)

	const captureSample = useCallback(
		(eventType: PointerEventType) => {
			const session = getActiveSpatialTranscriptSession()
			if (!session) return

			const tMs = performance.now() - session.startedAt
			const pagePoint = editor.inputs.getCurrentPagePoint()
			const screenPoint = editor.inputs.getCurrentScreenPoint()
			const shape = editor.getShapeAtPoint(pagePoint, { hitInside: true })
			const shapeIds = shape ? [shape.id as string] : []
			const selectedShapeIds = editor.getSelectedShapeIds() as TLShapeId[] as string[]

			const sample = {
				tMs,
				pagePoint: { x: pagePoint.x, y: pagePoint.y },
				screenPoint: { x: screenPoint.x, y: screenPoint.y },
				shapeIds,
				selectedShapeIds,
				eventType,
			}
			appendPointerSample(sample)

			const dwell = updateDwellTracker(dwellTrackerRef.current, sample)
			if (dwell) appendDwellRegion(dwell)

			if (tMs - lastCircleEndRef.current > 800) {
				const circle = detectCircledRegion(session.pointerSamples, editor, tMs)
				if (circle) {
					lastCircleEndRef.current = circle.tMsEnd
					appendCircledRegion(circle)
				}
			}
		},
		[editor]
	)

	const onPointerMove = useCallback(() => {
		const now = performance.now()
		if (now - lastMoveSampleRef.current < MOVE_THROTTLE_MS) return
		lastMoveSampleRef.current = now
		captureSample('move')
	}, [captureSample])

	const onPointerDown = useCallback(() => {
		captureSample('down')
	}, [captureSample])

	const onPointerUp = useCallback(() => {
		captureSample('up')
	}, [captureSample])

	const start = useCallback(() => {
		if (!getActiveSpatialTranscriptSession()) return

		dwellTrackerRef.current = createDwellTracker()
		lastMoveSampleRef.current = 0
		lastCircleEndRef.current = -Infinity

		const container = editor.getContainer()
		container.addEventListener('pointermove', onPointerMove)
		container.addEventListener('pointerdown', onPointerDown)
		container.addEventListener('pointerup', onPointerUp)

		captureSample('move')
		intervalRef.current = window.setInterval(() => {
			if (!getActiveSpatialTranscriptSession()) return
			captureSample('move')
		}, SAMPLE_INTERVAL_MS)

		cleanupRef.current = () => {
			container.removeEventListener('pointermove', onPointerMove)
			container.removeEventListener('pointerdown', onPointerDown)
			container.removeEventListener('pointerup', onPointerUp)
		}
	}, [captureSample, editor, onPointerDown, onPointerMove, onPointerUp])

	const stop = useCallback(() => {
		if (intervalRef.current !== null) {
			window.clearInterval(intervalRef.current)
			intervalRef.current = null
		}
		cleanupRef.current?.()
		cleanupRef.current = null
	}, [])

	return { start, stop }
}
