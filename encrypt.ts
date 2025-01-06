// Thanks to: https://davidmyers.dev/blog/a-practical-guide-to-the-web-cryptography-api

const importKey = async (rawKey: ArrayBuffer) => {
    return window.crypto.subtle.importKey(
      "raw",
      rawKey,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );
  }

const encode = (text: string) => {
	const encoder = new TextEncoder()
	return encoder.encode(text)
}

const generateIv = () => {
	return window.crypto.getRandomValues(new Uint8Array(12))
}

const encrypt = async (text: string, key: CryptoKey) => {
	const encoded = encode(text)
	const iv = generateIv()
	const cipher = await window.crypto.subtle.encrypt({
		name: 'AES-GCM',
		iv: iv,
	}, key, encoded)

	return {
		cipher,
		iv,
	}
}

const pack = (buffer: ArrayBuffer) => {
	return window.btoa(
		String.fromCharCode.apply(null, new Uint8Array(buffer))
	)
}

const unpack = (packed: string) => {
	const string = window.atob(packed)
	const buffer = new ArrayBuffer(string.length)
	const bufferView = new Uint8Array(buffer)

	for (let i = 0; i < string.length; i++) {
		bufferView[i] = string.charCodeAt(i)
	}
	return buffer
}

const decode = (bytestream: Uint8Array) => {
	const decoder = new TextDecoder()
	return decoder.decode(bytestream)
}

const decrypt = async (cipher: ArrayBuffer, key: CryptoKey, iv: ArrayBuffer) => {
	const encoded = await window.crypto.subtle.decrypt({
		name: 'AES-GCM',
		iv: iv,
	}, key, cipher)
	return decode(encoded)
}

const generateKey = (seed: string) => window.crypto.subtle.digest('SHA-256', unpack(seed));

const encryptText = async (key: ArrayBuffer, text: string) => {
	const cryptoKey = await importKey(key);
	const {cipher, iv} = await encrypt(text, cryptoKey)
	return pack(iv) + ':' + pack(cipher);
}

const decryptText = async (key: ArrayBuffer, text: string) => {
	if (text) {
		const cryptoKey = await importKey(key);
		let textParts = text.split(":");
		let iv = textParts.shift();
		if (iv) {
			let encryptedText = textParts.join(":");
			return await decrypt(unpack(encryptedText), cryptoKey, unpack(iv));
		} else {
			return '';
		}
	}
	else {
		return '';
	}
}

export {generateKey, encryptText, decryptText}
