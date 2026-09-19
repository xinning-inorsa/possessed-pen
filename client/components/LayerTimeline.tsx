import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLayers } from '../layers/LayerContext'

function formatTime(ts: number) {
	return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export type LayerTimelineProps = {
	isEmptyCanvas?: boolean
}

export function LayerTimeline({ isEmptyCanvas = false }: LayerTimelineProps = {}) {
	const { layers, activeLayerId, setActiveLayer } = useLayers()
	const [expanded, setExpanded] = useState(false)
	const panelRef = useRef<HTMLElement>(null)

	const ordered = useMemo(() => [...layers].reverse(), [layers])
	const count = layers.length

	const collapse = useCallback(() => setExpanded(false), [])
	const expand = useCallback(() => setExpanded(true), [])

	useEffect(() => {
		if (!expanded) return

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') collapse()
		}

		const onPointerDown = (e: PointerEvent) => {
			if (panelRef.current?.contains(e.target as Node)) return
			collapse()
		}

		document.addEventListener('keydown', onKeyDown)
		const id = window.setTimeout(() => {
			document.addEventListener('pointerdown', onPointerDown)
		}, 0)

		return () => {
			clearTimeout(id)
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('pointerdown', onPointerDown)
		}
	}, [expanded, collapse])

	if (!expanded) {
		return (
			<button
				type="button"
				className={`pp-layer-timeline__chip${isEmptyCanvas ? ' pp-layer-timeline__chip--empty' : ''}`}
				onClick={expand}
				aria-expanded={false}
				aria-controls="pp-layer-timeline-panel"
				aria-label={`Timeline, ${count} layer${count === 1 ? '' : 's'}. Expand.`}
			>
				<span className="pp-layer-timeline__chip-icon" aria-hidden>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<rect x="1" y="4" width="10" height="2" rx="0.5" fill="currentColor" />
						<rect x="2" y="7" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.7" />
						<rect x="3" y="1" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
					</svg>
				</span>
				<span className="pp-layer-timeline__chip-label">Timeline</span>
				<span className="pp-layer-timeline__chip-count">{count}</span>
			</button>
		)
	}

	return (
		<aside
			ref={panelRef}
			id="pp-layer-timeline-panel"
			className="pp-layer-timeline pp-layer-timeline--expanded"
			aria-label="Generation timeline"
		>
			<div className="pp-layer-timeline__header">
				<span className="pp-layer-timeline__title">Timeline</span>
				<span className="pp-layer-timeline__count">{count}</span>
				<button
					type="button"
					className="pp-layer-timeline__collapse"
					onClick={collapse}
					aria-expanded={true}
					aria-controls="pp-layer-timeline-panel"
					aria-label="Collapse timeline"
				>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
						<path
							d="M2 2l6 6M8 2L2 8"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
			{!count ? (
				<p className={`pp-layer-timeline__empty${isEmptyCanvas ? ' pp-layer-timeline__empty--pulse' : ''}`}>
					Ink something to begin
				</p>
			) : (
				<ol className="pp-layer-timeline__list">
					{ordered.map((layer, index) => {
						const isActive = layer.id === activeLayerId
						const isLatest = index === 0
						return (
							<li key={layer.id} className="pp-layer-timeline__item">
								<button
									type="button"
									className={
										'pp-layer-timeline__node' +
										(isActive ? ' pp-layer-timeline__node--active' : '') +
										(isLatest ? ' pp-layer-timeline__node--latest' : '')
									}
									onClick={() => setActiveLayer(layer.id)}
									aria-current={isActive ? 'step' : undefined}
								>
									<span className="pp-layer-timeline__rail" aria-hidden>
										<span className="pp-layer-timeline__dot" />
										{index < ordered.length - 1 && (
											<span className="pp-layer-timeline__connector" />
										)}
									</span>
									<span className="pp-layer-timeline__body">
										<span className="pp-layer-timeline__name">{layer.name}</span>
										<span className="pp-layer-timeline__meta">
											{formatTime(layer.createdAt)} · {layer.shapeIds.length} shapes
										</span>
									</span>
								</button>
							</li>
						)
					})}
				</ol>
			)}
		</aside>
	)
}
