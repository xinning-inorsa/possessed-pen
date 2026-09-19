export interface Environment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	GOOGLE_API_KEY: string
	AWS_REGION?: string
	AWS_BEARER_TOKEN_BEDROCK?: string
	AWS_ACCESS_KEY_ID?: string
	AWS_SECRET_ACCESS_KEY?: string
	AWS_SESSION_TOKEN?: string
	BEDROCK_MODEL_ID?: string
}
