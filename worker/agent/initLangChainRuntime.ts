import { AsyncLocalStorage } from 'node:async_hooks'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'

let initialized = false

/** LangGraph interrupt() needs real AsyncLocalStorage; Workers mock ALS drops graph config. */
export function initLangChainRuntime() {
	if (initialized) return
	AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new AsyncLocalStorage())
	initialized = true
}
