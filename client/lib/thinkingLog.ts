import { useEffect, useState } from 'react'

const MAX_ATTEMPTS = 20

export type ThinkingAttemptStatus = 'running' | 'ok' | 'error'

export type ThinkingStepKind =
	| 'transcribe'
	| 'deixis'
	| 'api-request'
	| 'api-response'
	| 'ink'
	| 'error'

export type ThinkingStep = {
	id: string
	at: number
	kind: ThinkingStepKind
	title: string
	body?: unknown
	durationMs?: number
	error?: string
}

export type ThinkingAttempt = {
	id: string
	startedAt: number
	completedAt?: number
	status: ThinkingAttemptStatus
	source: 'voice' | 'ink'
	steps: ThinkingStep[]
}

let attempts: ThinkingAttempt[] = []
const listeners = new Set<() => void>()

function emit() {
	for (const listener of listeners) {
		listener()
	}
}

function findAttempt(attemptId: string): ThinkingAttempt | undefined {
	return attempts.find((a) => a.id === attemptId)
}

export function getThinkingAttempts(): readonly ThinkingAttempt[] {
	return attempts
}

export function subscribeThinkingLog(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useThinkingLog(): readonly ThinkingAttempt[] {
	const [, tick] = useState(0)
	useEffect(() => subscribeThinkingLog(() => tick((t) => t + 1)), [])
	return attempts
}

export function createThinkingAttempt(source: 'voice' | 'ink'): string {
	const id = crypto.randomUUID()
	const attempt: ThinkingAttempt = {
		id,
		startedAt: Date.now(),
		status: 'running',
		source,
		steps: [],
	}
	attempts = [attempt, ...attempts].slice(0, MAX_ATTEMPTS)
	emit()
	return id
}

export function addThinkingStep(
	attemptId: string,
	step: Omit<ThinkingStep, 'id' | 'at'>
): void {
	const attempt = findAttempt(attemptId)
	if (!attempt) return
	attempt.steps.push({
		id: crypto.randomUUID(),
		at: Date.now(),
		...step,
	})
	emit()
}

export function finishThinkingAttempt(
	attemptId: string,
	status: 'ok' | 'error'
): void {
	const attempt = findAttempt(attemptId)
	if (!attempt) return
	attempt.status = status
	attempt.completedAt = Date.now()
	emit()
}

export function clearThinkingLog(): void {
	attempts = []
	emit()
}
