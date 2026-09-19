import { useSyncExternalStore } from 'react'
import {
	getInspectableSession,
	getInspectableSessionVersion,
	getLiveCallState,
	subscribeSpatialTranscriptSession,
	type LiveCallState,
	type SpatialTranscriptSession,
} from '../lib/spatialTranscript'

export type InspectableSessionSnapshot = {
	session: SpatialTranscriptSession | null
	live: LiveCallState
}

export function useInspectableSession(): InspectableSessionSnapshot {
	useSyncExternalStore(
		subscribeSpatialTranscriptSession,
		getInspectableSessionVersion,
		getInspectableSessionVersion
	)
	return {
		session: getInspectableSession(),
		live: getLiveCallState(),
	}
}
