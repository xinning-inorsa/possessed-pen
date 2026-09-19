import type { Environment } from '../environment'
import { createBedrockChatModel as createAiSdkBedrockModel } from './AiSdkBedrockChatModel'

/** Workers-safe Bedrock model for Deep Agents (AI SDK Anthropic on Bedrock, not AWS SDK). */
export function createBedrockChatModel(env: Environment) {
	return createAiSdkBedrockModel(env)
}
