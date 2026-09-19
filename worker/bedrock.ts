import { createAmazonBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic'
import type { LanguageModel } from 'ai'
import { Environment } from './environment'

export const DEFAULT_BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

/** Fallback when Sonnet 4.5 is unavailable on the account. */
export const FALLBACK_BEDROCK_MODEL_ID = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'

export function getBedrockModelId(env: Environment): string {
	return env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL_ID
}

function bedrockAuthOptions(env: Environment) {
	return {
		region: env.AWS_REGION || 'us-east-1',
		...(env.AWS_BEARER_TOKEN_BEDROCK
			? { apiKey: env.AWS_BEARER_TOKEN_BEDROCK }
			: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
				? {
						accessKeyId: env.AWS_ACCESS_KEY_ID,
						secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
						sessionToken: env.AWS_SESSION_TOKEN,
					}
				: {}),
	}
}

/** Native Anthropic Messages API on Bedrock (supports Claude 4.x; not Converse v2). */
export function createBedrockAnthropicProvider(env: Environment) {
	return createAmazonBedrockAnthropic(bedrockAuthOptions(env))
}

export function getBedrockLanguageModel(env: Environment): LanguageModel {
	const provider = createBedrockAnthropicProvider(env)
	return provider(getBedrockModelId(env))
}
