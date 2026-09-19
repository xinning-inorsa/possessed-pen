import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from 'react'
import { Layer } from './types'

type LayerStoreValue = {
	layers: Layer[]
	activeLayerId: string | null
	addLayer: (layer: Layer) => void
	setActiveLayerId: (id: string | null) => void
	updateLayerShapeIds: (id: string, shapeIds: string[]) => void
	clearLayers: () => void
}

const LayerStoreContext = createContext<LayerStoreValue | null>(null)

export function LayerStoreProvider({ children }: { children: ReactNode }) {
	const [layers, setLayers] = useState<Layer[]>([])
	const [activeLayerId, setActiveLayerId] = useState<string | null>(null)

	const addLayer = useCallback((layer: Layer) => {
		setLayers((prev) => [...prev, layer])
		setActiveLayerId(layer.id)
	}, [])

	const updateLayerShapeIds = useCallback((id: string, shapeIds: string[]) => {
		setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, shapeIds } : layer)))
	}, [])

	const clearLayers = useCallback(() => {
		setLayers([])
		setActiveLayerId(null)
	}, [])

	const value = useMemo(
		() => ({
			layers,
			activeLayerId,
			addLayer,
			setActiveLayerId,
			updateLayerShapeIds,
			clearLayers,
		}),
		[layers, activeLayerId, addLayer, updateLayerShapeIds, clearLayers]
	)

	return <LayerStoreContext.Provider value={value}>{children}</LayerStoreContext.Provider>
}

export function useLayerStore(): LayerStoreValue {
	const ctx = useContext(LayerStoreContext)
	if (!ctx) throw new Error('useLayerStore must be used inside LayerStoreProvider')
	return ctx
}
