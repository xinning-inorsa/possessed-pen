import { useCallback, useEffect, useRef, useState } from 'react'
import { formatThinkingLogMarkdown } from '../lib/formatThinkingLogMarkdown'
import { popupClassName, usePopupPresence } from '../hooks/usePopupPresence'
import {
	clearThinkingLog,
	type ThinkingAttempt,
	type ThinkingStep,
	useThinkingLog,
} from '../lib/thinkingLog'

function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	return `${(ms / 1000).toFixed(1)}s`
}

function attemptDuration(attempt: ThinkingAttempt): number | undefined {
	if (!attempt.completedAt) return Date.now() - attempt.startedAt
	return attempt.completedAt - attempt.startedAt
}

function statusLabel(status: ThinkingAttempt['status']): string {
	switch (status) {
		case 'running':
			return 'running'
		case 'ok':
			return 'ok'
		case 'error':
			return 'error'
	}
}

function stepPreview(step: ThinkingStep): string | undefined {
	if (step.error) return step.error
	if (typeof step.body === 'string') return step.body
	if (step.body && typeof step.body === 'object') {
		const body = step.body as Record<string, unknown>
		if (typeof body.mermaid === 'string') {
			const lines = body.mermaid.split('\n').filter(Boolean)
			return lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '')
		}
		if (typeof body.prompt === 'string') return body.prompt
		if (typeof body.transcript === 'string') return body.transcript
		if (typeof body.resolvedText === 'string') return body.resolvedText
	}
	return undefined
}

function truncateForDisplay(value: unknown, maxString = 240): unknown {
	if (typeof value === 'string') {
		if (value.length <= maxString) return value
		return `${value.slice(0, maxString)}… (${value.length} chars)`
	}
	if (Array.isArray(value)) {
		return value.map((item) => truncateForDisplay(item, maxString))
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [key, item] of Object.entries(value)) {
			out[key] = truncateForDisplay(item, maxString)
		}
		return out
	}
	return value
}

function JsonBlock({ value }: { value: unknown }) {
	return (
		<pre className="pp-thinking__json">{JSON.stringify(truncateForDisplay(value), null, 2)}</pre>
	)
}

function StepSection({ step, defaultOpen }: { step: ThinkingStep; defaultOpen: boolean }) {
	const [open, setOpen] = useState(defaultOpen)
	const hasBody = step.body !== undefined || Boolean(step.error)
	const preview = stepPreview(step)

	useEffect(() => {
		if (defaultOpen) setOpen(true)
	}, [defaultOpen, step.id])

	return (
		<div className={'pp-thinking__step pp-thinking__step--' + step.kind}>
			<button
				type="button"
				className="pp-thinking__step-header"
				onClick={() => hasBody && setOpen((v) => !v)}
				aria-expanded={open}
				disabled={!hasBody}
			>
				<span className="pp-thinking__step-kind">{step.kind}</span>
				<span className="pp-thinking__step-title">{step.title}</span>
				{step.durationMs != null && (
					<span className="pp-thinking__step-duration">{formatDuration(step.durationMs)}</span>
				)}
				{hasBody && (
					<span className="pp-thinking__step-chevron" aria-hidden>
						{open ? '▾' : '▸'}
					</span>
				)}
			</button>
			{!open && preview && <div className="pp-thinking__step-preview">{preview}</div>}
			{open && hasBody && (
				<div className="pp-thinking__step-body">
					{step.error && <div className="pp-thinking__error">{step.error}</div>}
					{step.body !== undefined && <JsonBlock value={step.body} />}
				</div>
			)}
		</div>
	)
}

function AttemptCard({ attempt, isLatest }: { attempt: ThinkingAttempt; isLatest: boolean }) {
	const [open, setOpen] = useState(isLatest || attempt.status === 'running')
	const duration = attemptDuration(attempt)
	const latestStepId = attempt.steps.at(-1)?.id
	const firstPrompt = attempt.steps.find(
		(s) => s.kind === 'deixis' || s.kind === 'api-request'
	)
	const promptBody =
		firstPrompt?.body && typeof firstPrompt.body === 'object'
			? (firstPrompt.body as Record<string, unknown>)
			: undefined
	const promptPreview =
		typeof promptBody?.resolvedText === 'string'
			? promptBody.resolvedText
			: typeof promptBody?.prompt === 'string'
				? promptBody.prompt
				: undefined

	useEffect(() => {
		if (isLatest || attempt.status === 'running') setOpen(true)
	}, [attempt.status, attempt.steps.length, isLatest])

	return (
		<article className={'pp-thinking__attempt pp-thinking__attempt--' + attempt.status}>
			<button
				type="button"
				className="pp-thinking__attempt-header"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<span className="pp-thinking__attempt-time">{formatTime(attempt.startedAt)}</span>
				<span className="pp-thinking__attempt-source">{attempt.source}</span>
				<span className={'pp-thinking__attempt-status pp-thinking__attempt-status--' + attempt.status}>
					{statusLabel(attempt.status)}
				</span>
				<span className="pp-thinking__attempt-step-count">{attempt.steps.length} steps</span>
				{duration != null && (
					<span className="pp-thinking__attempt-duration">{formatDuration(duration)}</span>
				)}
				<span className="pp-thinking__step-chevron" aria-hidden>
					{open ? '▾' : '▸'}
				</span>
			</button>
			{!open && promptPreview && (
				<div className="pp-thinking__attempt-preview">
					{promptPreview.length > 80 ? `${promptPreview.slice(0, 77)}…` : promptPreview}
				</div>
			)}
			{open && (
				<div className="pp-thinking__attempt-steps">
					{attempt.steps.map((step) => (
						<StepSection
							key={step.id}
							step={step}
							defaultOpen={
								step.kind === 'error' ||
								step.kind === 'api-response' ||
								step.id === latestStepId
							}
						/>
					))}
				</div>
			)}
		</article>
	)
}

export function ThinkingPanel() {
	const attempts = useThinkingLog()
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState(false)
	const panelRef = useRef<HTMLElement>(null)
	const stickToBottomRef = useRef(true)

	const collapse = useCallback(() => setExpanded(false), [])
	const expand = useCallback(() => setExpanded(true), [])
	const panel = usePopupPresence(expanded)

	const runningCount = attempts.filter((a) => a.status === 'running').length
	const isThinking = runningCount > 0
	const hasTrace = attempts.length > 0

	useEffect(() => {
		if (isThinking) setExpanded(true)
	}, [isThinking])

	useEffect(() => {
		if (!expanded) {
			stickToBottomRef.current = true
		}
	}, [expanded])

	useEffect(() => {
		const panel = panelRef.current
		if (!expanded || !panel) return

		const onScroll = () => {
			const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight
			stickToBottomRef.current = distanceFromBottom < 48
		}

		panel.addEventListener('scroll', onScroll, { passive: true })
		return () => panel.removeEventListener('scroll', onScroll)
	}, [expanded])

	useEffect(() => {
		const panel = panelRef.current
		if (!expanded || !panel) return
		if (!stickToBottomRef.current && !isThinking) return
		panel.scrollTop = panel.scrollHeight
	}, [attempts, expanded, isThinking])

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

	const copyTrace = useCallback(async () => {
		if (attempts.length === 0) return
		const markdown = formatThinkingLogMarkdown(attempts)
		try {
			await navigator.clipboard.writeText(markdown)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			setCopied(false)
		}
	}, [attempts])

	if (!hasTrace && !panel.mounted) {
		return null
	}

	return (
		<>
			{hasTrace && !expanded && (
				<button
					type="button"
					className={
						'pp-thinking__chip pp-glass' + (isThinking ? ' pp-thinking__chip--active' : '')
					}
					onClick={expand}
					aria-expanded={false}
					aria-controls="pp-thinking-panel"
					aria-label={isThinking ? 'Thinking in progress. Expand trace.' : 'Expand thinking trace.'}
				>
					<span className="pp-thinking__chip-icon" aria-hidden>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
							<path
								d="M2 6.5h8M6 2.5v8"
								stroke="currentColor"
								strokeWidth="1.25"
								strokeLinecap="round"
							/>
							<circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.25" />
						</svg>
					</span>
					<span className="pp-thinking__chip-label">{isThinking ? 'Thinking' : 'Trace'}</span>
					<span className="pp-thinking__chip-count">{attempts.length}</span>
				</button>
			)}
			{panel.mounted && (
				<aside
					ref={panelRef}
					id="pp-thinking-panel"
					className={popupClassName(
						panel.open,
						'pp-thinking',
						'pp-thinking--expanded',
						'pp-glass',
						'pp-glass--panel'
					)}
					aria-label="Thinking debug log"
					aria-hidden={!panel.open}
					onTransitionEnd={panel.onTransitionEnd}
				>
					<div className="pp-thinking__header">
						<span className="pp-thinking__title">Thinking</span>
						<span className="pp-thinking__meta">
							{attempts.length} attempt{attempts.length === 1 ? '' : 's'}
							{runningCount > 0 ? ` · ${runningCount} running` : ''}
						</span>
						<div className="pp-thinking__header-actions">
							<button
								type="button"
								className="pp-thinking__copy"
								onClick={() => void copyTrace()}
								disabled={attempts.length === 0}
								aria-label="Copy trace as markdown"
								title="Copy trace as markdown"
							>
								{copied ? (
									<span className="pp-thinking__copy-label">Copied</span>
								) : (
									<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
										<rect
											x="4"
											y="4"
											width="6"
											height="6"
											rx="1"
											stroke="currentColor"
											strokeWidth="1.1"
										/>
										<path
											d="M3 8V3a1 1 0 0 1 1-1h5"
											stroke="currentColor"
											strokeWidth="1.1"
											strokeLinecap="round"
										/>
									</svg>
								)}
							</button>
							<button
								type="button"
								className="pp-thinking__clear"
								onClick={clearThinkingLog}
								disabled={attempts.length === 0}
							>
								Clear
							</button>
							<button
								type="button"
								className="pp-thinking__collapse"
								onClick={collapse}
								aria-expanded={true}
								aria-controls="pp-thinking-panel"
								aria-label="Collapse thinking log"
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
					</div>

					<div className="pp-thinking__list">
						{attempts.length === 0 ? (
							<p className="pp-thinking__empty">
								No ink attempts yet. Start a call and speak, or generate from selection.
							</p>
						) : (
							attempts.map((attempt, index) => (
								<AttemptCard key={attempt.id} attempt={attempt} isLatest={index === 0} />
							))
						)}
					</div>
				</aside>
			)}
		</>
	)
}
