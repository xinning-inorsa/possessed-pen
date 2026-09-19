/** Brief pause between agent tool batches (not per individual tool). */
export const AGENT_STEP_DELAY_MS = 300

const MUTATION_TOOLS = new Set([
	'label',
	'update',
	'delete_shape',
	'create',
	'place',
	'connect_shapes',
])

export function isMutationTool(tool: string): boolean {
	return MUTATION_TOOLS.has(tool)
}

export function describeToolStep(tool: string, args: Record<string, unknown>): string {
	const intent = typeof args.intent === 'string' ? args.intent.trim() : ''
	if (intent) return intent

	switch (tool) {
		case 'inspect_shapes':
			return 'Inspecting shapes on the canvas…'
		case 'label':
			return `Renaming to “${String(args.text ?? '')}”…`
		case 'delete_shape':
			return 'Removing a shape…'
		case 'create':
			return 'Adding a new shape…'
		case 'place':
			return 'Positioning the new shape…'
		case 'connect_shapes':
			return `Connecting ${String(args.fromShapeId ?? '')} → ${String(args.toShapeId ?? '')}…`
		case 'update':
			return 'Updating a shape…'
		default:
			return `Applying ${tool}…`
	}
}

export function describeToolResult(tool: string, ok: boolean): string {
	if (!ok) {
		switch (tool) {
			case 'create':
				return 'Could not add shape — retry with rectangle + place.'
			case 'label':
				return 'Could not rename — shape not found.'
			default:
				return `Could not apply ${tool}.`
		}
	}
	switch (tool) {
		case 'inspect_shapes':
			return 'Checked canvas (no changes).'
		case 'label':
			return 'Label updated.'
		case 'delete_shape':
			return 'Shape removed.'
		case 'create':
			return 'Shape created.'
		case 'place':
			return 'Shape placed.'
		case 'connect_shapes':
			return 'Shapes connected.'
		case 'update':
			return 'Shape updated.'
		default:
			return `${tool} done.`
	}
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return Promise.resolve()
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => {
			signal?.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		const onAbort = () => {
			window.clearTimeout(timer)
			reject(new DOMException('Cancelled', 'AbortError'))
		}
		if (signal?.aborted) {
			window.clearTimeout(timer)
			reject(new DOMException('Cancelled', 'AbortError'))
			return
		}
		signal?.addEventListener('abort', onAbort, { once: true })
	})
}
