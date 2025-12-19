const ALGORITHM = { name: "AES-GCM", length: 256 };

export async function generateKey(hostname: string): Promise<CryptoKey> {
	// Create a stable key from hostname using SHA-256
	const encoder = new TextEncoder();
	const hostData = encoder.encode(hostname);
	const hashBuffer = await crypto.subtle.digest("SHA-256", hostData);

	// Import the hash as an AES key
	return await crypto.subtle.importKey("raw", hashBuffer, ALGORITHM, false, [
		"encrypt",
		"decrypt",
	]);
}

export async function encrypt(text: string, key: CryptoKey): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encodedText = new TextEncoder().encode(text);

	const encryptedData = await crypto.subtle.encrypt(
		{ ...ALGORITHM, iv },
		key,
		encodedText,
	);

	// Combine IV and encrypted data
	const combined = new Uint8Array([...iv, ...new Uint8Array(encryptedData)]);
	return btoa(String.fromCharCode(...combined));
}

export async function decrypt(
	encryptedText: string,
	key: CryptoKey,
): Promise<string> {
	try {
		const combined = new Uint8Array(
			atob(encryptedText)
				.split("")
				.map((char) => char.charCodeAt(0)),
		);

		// Split IV and encrypted data
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);

		const decryptedData = await crypto.subtle.decrypt(
			{ ...ALGORITHM, iv },
			key,
			data,
		);

		return new TextDecoder().decode(decryptedData);
	} catch (_error) {
		throw new Error(
			"Failed to decrypt data: The data may be corrupted or from a different machine",
		);
	}
}
