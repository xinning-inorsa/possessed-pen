/** Turn itty-router / fetch error bodies into a short user-facing string. */
export function parseApiError(raw: string, fallback: string): string {
	if (!raw.trim()) return fallback
	try {
		const parsed = JSON.parse(raw) as { error?: string; message?: string }
		if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim()
		if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
	} catch {
		// plain text body
		if (raw.length < 200 && !raw.startsWith('{')) return raw.trim()
	}
	if (raw.includes('UnsupportedModelVersion')) {
		return 'Bedrock model incompatible — check BEDROCK_MODEL_ID in .dev.vars'
	}
	return fallback
}
