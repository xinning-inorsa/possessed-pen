import { fileURLToPath } from 'url'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			cloudflare(),
			react(),
		],
		resolve: {
			alias: [
				{
					find: '@aws-sdk/client-bedrock-runtime/dist-es/runtimeConfig.js',
					replacement: '@aws-sdk/client-bedrock-runtime/dist-es/runtimeConfig.browser.js',
				},
			],
		},
		environments: {
			possessed_pen: {
				resolve: {
					conditions: ['workerd', 'worker', 'browser', 'import', 'module'],
					mainFields: ['browser', 'module', 'main'],
				},
			},
		},
		ssr: {
			noExternal: [
				'deepagents',
				'@langchain/aws',
				'@langchain/core',
				'@langchain/langgraph',
				'@langchain/langgraph-checkpoint',
				'langchain',
				'@aws-sdk/client-bedrock-runtime',
				'@smithy/fetch-http-handler',
			],
		},
	}
})
