/** True when the user wants a subgraph redraw (Mermaid replace), not a label/color tweak. */
const RESTRUCTURE_PATTERN =
	/\b(replace|restructure|rewrite|redraw|regenerate|swap\s+out|instead\s+of|different\s+(flow|diagram|architecture)|this\s+part|whole\s+(section|cluster|subgraph))\b/i

export function shouldRestructureCluster(prompt: string): boolean {
	return RESTRUCTURE_PATTERN.test(prompt.trim())
}
