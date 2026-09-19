import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react'
import { Editor } from 'tldraw'

export type Layer = {
	id: string
	name: string
	createdAt: number
	shapeIds: string[]
	bounds?: { x: number; y: number; w: number; h: number }
	prompt?: string
	parentLayerId?: string
}

type LayerContextValue = {
	layers: Layer[]
	activeLayerId: string | null
	addLayer: (layer: Omit<Layer, 'createdAt'> & { createdAt?: number }) => Layer
	setActiveLayer: (id: string | null) => void
	updateLayerShapeIds: (id: string, shapeIds: string[]) => void
}

const LayerContext = createContext<LayerContextValue | null>(null)

export function LayerProvider({ children }: { children: ReactNode }) {
	const [layers, setLayers] = useState<Layer[]>([])
	const [activeLayerId, setActiveLayerId] = useState<string | null>(null)

	const addLayer = useCallback(
		(layer: Omit<Layer, 'createdAt'> & { createdAt?: number }) => {
			const full: Layer = { ...layer, createdAt: layer.createdAt ?? Date.now() }
			setLayers((prev) => [...prev, full])
			setActiveLayerId(full.id)
			return full
		},
		[]
	)

	const updateLayerShapeIds = useCallback((id: string, shapeIds: string[]) => {
		setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, shapeIds } : l)))
	}, [])

	const value = useMemo(
		() => ({
			layers,
			activeLayerId,
			addLayer,
			setActiveLayer: setActiveLayerId,
			updateLayerShapeIds,
		}),
		[layers, activeLayerId, addLayer, updateLayerShapeIds]
	)

	return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>
}

export function useLayers() {
	const ctx = useContext(LayerContext)
	if (!ctx) throw new Error('useLayers requires LayerProvider')
	return ctx
}

export function LayerDimmingEffect({ editor }: { editor: Editor }) {
	const { activeLayerId } = useLayers()

	useEffect(() => {
		if (!activeLayerId) return
		for (const shape of editor.getCurrentPageShapes()) {
			const layerId = shape.meta?.layerId as string | undefined
			if (!layerId) continue
			const opacity = layerId === activeLayerId ? 1 : 0.25
			if (shape.opacity !== opacity) {
				editor.updateShape({ id: shape.id, type: shape.type, opacity })
			}
		}
	}, [editor, activeLayerId])

	return null
}
