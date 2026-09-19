import type { ThinkingAttempt } from './thinkingLog'

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts: number): string {
	return new Date(ts).toISOString()
}

function attemptMarkdown(attempt: ThinkingAttempt, index: number): string {
	const duration =
		attempt.completedAt != null
			? formatDuration(attempt.completedAt - attempt.startedAt)
			: formatDuration(Date.now() - attempt.startedAt)

	const lines = [
		`## Attempt ${index + 1} — ${attempt.source} — ${attempt.status} (${duration})`,
		``,
		`- **Started:** ${formatTime(attempt.startedAt)}`,
	]
	if (attempt.completedAt) {
		lines.push(`- **Completed:** ${formatTime(attempt.completedAt)}`)
	}
	lines.push('')

	for (const step of attempt.steps) {
		const dur = step.durationMs != null ? ` (${formatDuration(step.durationMs)})` : ''
		lines.push(`### ${step.kind} — ${step.title}${dur}`)
		lines.push(`- **At:** ${formatTime(step.at)}`)
		if (step.error) lines.push(`- **Error:** ${step.error}`)
		if (step.body !== undefined) {
			lines.push('', '```json', JSON.stringify(step.body, null, 2), '```', '')
		} else {
			lines.push('')
		}
	}

	return lines.join('\n')
}

/** Serialize the thinking log as markdown for debugging. */
export function formatThinkingLogMarkdown(attempts: readonly ThinkingAttempt[]): string {
	const header = [
		'# Possessed Pen — thinking trace',
		'',
		`Exported: ${new Date().toISOString()}`,
		`Attempts: ${attempts.length}`,
		'',
	]

	if (attempts.length === 0) {
		return [...header, '_No attempts recorded._', ''].join('\n')
	}

	const body = attempts.map((attempt, index) => attemptMarkdown(attempt, index))
	return [...header, ...body].join('\n')
}
