/** True when the user wants a subgraph Mermaid replace — not substituting one node/block. */
export function shouldRestructureCluster(prompt: string): boolean {
	const text = prompt.trim()
	if (!text) return false

	if (/\b(restructure|rewrite|redraw|regenerate|redesign)\b/i.test(text)) return true
	if (/\b(whole|entire)\s+(section|cluster|subgraph|diagram|flow)\b/i.test(text)) return true
	if (/\bthis\s+part\b/i.test(text)) return true
	if (/\bdifferent\s+(flow|diagram|architecture)\b/i.test(text)) return true
	if (/\breplace\s+(the|this)\s+(whole|entire|section|cluster|subgraph|part)\b/i.test(text)) {
		return true
	}

	// "replace the User block with a frontend stack" → surgical (one node → small stack).
	return false
}
