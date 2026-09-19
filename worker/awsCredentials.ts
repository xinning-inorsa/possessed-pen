import type { Environment } from './environment'

export function getAwsRegion(env: Environment): string {
	return env.AWS_REGION || 'us-east-1'
}

export function getAwsIamCredentials(env: Environment) {
	const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim()
	const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim()
	if (!accessKeyId || !secretAccessKey) {
		return null
	}
	return {
		accessKeyId,
		secretAccessKey,
		sessionToken: env.AWS_SESSION_TOKEN?.trim(),
	}
}

export function transcribeCredentialsError(): string {
	return 'Speech transcription requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .dev.vars (Amazon Transcribe IAM; Bedrock bearer token is not supported)'
}
