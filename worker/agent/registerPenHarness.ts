import { createHarnessProfile, registerHarnessProfile } from 'deepagents'

let registered = false

/** Possessed-pen harness: canvas read-only FS, no shell/subagents/task planner. */
export function registerPenHarnessProfile() {
	if (registered) return
	registered = true
	registerHarnessProfile(
		'bedrock',
		createHarnessProfile({
			excludedTools: ['execute', 'task', 'write_file', 'edit_file', 'delete'],
			generalPurposeSubagent: { enabled: false },
		})
	)
}
