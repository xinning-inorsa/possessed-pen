import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error } from 'itty-router'
import type { AgentStreamRequest } from '../../shared/types/AgentStreamProtocol'
import type { Environment } from '../environment'
import { DeepAgentService } from '../agent/DeepAgentService'
import { initLangChainRuntime } from '../agent/initLangChainRuntime'

export class AgentDurableObject extends DurableObject<Environment> {
	service: DeepAgentService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		initLangChainRuntime()
		this.service = new DeepAgentService(this.env)
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			return error(e)
		},
	}).post('/stream', (request) => this.stream(request))

	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	private async stream(request: Request): Promise<Response> {
		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		;(async () => {
			try {
				const body = (await request.json()) as AgentStreamRequest
				const event = await this.service.run(body)
				const data = `data: ${JSON.stringify(event)}\n\n`
				await writer.write(encoder.encode(data))
				await writer.close()
			} catch (err: unknown) {
				console.error('Stream error:', err)
				const message = err instanceof Error ? err.message : 'Stream failed'
				const errorData = `data: ${JSON.stringify({ type: 'error', message })}\n\n`
				try {
					await writer.write(encoder.encode(errorData))
					await writer.close()
				} catch (writeError) {
					await writer.abort(writeError)
				}
			}
		})()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'Transfer-Encoding': 'chunked',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		})
	}
}
