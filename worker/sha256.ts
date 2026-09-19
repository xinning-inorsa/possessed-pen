/** Web Crypto SHA-256 / HMAC-SHA-256 for `@smithy/signature-v4` (Vite cannot optimize `@aws-crypto/sha256-js`). */
type SourceData = string | ArrayBuffer | ArrayBufferView

export class Sha256 {
	#chunks: Uint8Array[] = []
	#key: Promise<CryptoKey> | undefined

	constructor(secret?: SourceData) {
		if (secret !== undefined) {
			this.#key = crypto.subtle.importKey(
				'raw',
				toArrayBuffer(secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			)
		}
	}

	update(data: SourceData): void {
		const bytes = toUint8Array(data)
		if (bytes.byteLength === 0) return
		this.#chunks.push(new Uint8Array(toArrayBuffer(bytes)))
	}

	async digest(): Promise<Uint8Array> {
		const data = concat(this.#chunks)
		if (this.#key) {
			return new Uint8Array(await crypto.subtle.sign('HMAC', await this.#key, data))
		}
		return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
	}

	reset(): void {
		this.#chunks = []
	}
}

function toUint8Array(data: SourceData): Uint8Array {
	if (typeof data === 'string') return new TextEncoder().encode(data)
	if (data instanceof Uint8Array) return data
	if (data instanceof ArrayBuffer) return new Uint8Array(data)
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function toArrayBuffer(data: SourceData): ArrayBuffer {
	const bytes = toUint8Array(data)
	const copy = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(copy).set(bytes)
	return copy
}

function concat(chunks: Uint8Array[]): ArrayBuffer {
	if (chunks.length === 0) return new ArrayBuffer(0)
	const out = new ArrayBuffer(chunks.reduce((n, c) => n + c.byteLength, 0))
	const view = new Uint8Array(out)
	let offset = 0
	for (const chunk of chunks) {
		view.set(chunk, offset)
		offset += chunk.byteLength
	}
	return out
}
