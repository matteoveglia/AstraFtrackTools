import { decrypt, encrypt, generateKey } from "./crypto.ts";

type Preferences = {
	FTRACK_SERVER?: string;
	FTRACK_API_USER?: string;
	FTRACK_API_KEY?: string;
};

function getPreferencesPath(): string {
	const appName = "astra-ftrack-tools";

	switch (Deno.build.os) {
		case "windows":
			return `${Deno.env.get("APPDATA")}\\${appName}\\preferences.json`;
		case "darwin":
			return `${Deno.env.get(
				"HOME",
			)}/Library/Application Support/${appName}/preferences.json`;
		case "linux":
			return `${Deno.env.get("HOME")}/.config/${appName}/preferences.json`;
		default:
			throw new Error("Unsupported operating system");
	}
}

async function ensurePreferencesDir(): Promise<void> {
	const prefsPath = getPreferencesPath();
	const prefsDir = prefsPath.slice(
		0,
		prefsPath.lastIndexOf(Deno.build.os === "windows" ? "\\" : "/"),
	);

	try {
		await Deno.mkdir(prefsDir, { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.AlreadyExists)) {
			throw error;
		}
	}
}

export async function savePreferences(prefs: Preferences): Promise<void> {
	await ensurePreferencesDir();
	const key = await generateKey(Deno.hostname());

	const entries = await Promise.all(
		Object.entries(prefs).map(async ([k, v]) => {
			const encrypted = v ? await encrypt(v, key) : null;
			return [k, encrypted] as [string, string | null];
		}),
	);

	const encryptedPrefs = Object.fromEntries(entries);

	await Deno.writeTextFile(
		getPreferencesPath(),
		JSON.stringify(encryptedPrefs, null, 2),
	);
}

export async function loadPreferences(): Promise<Preferences> {
	try {
		const content = await Deno.readTextFile(getPreferencesPath());
		const encryptedPrefs = JSON.parse(content) as Record<string, string | null>;
		const key = await generateKey(Deno.hostname());

		const entries = await Promise.all(
			Object.entries(encryptedPrefs).map(async ([k, v]) => {
				const decrypted = v ? await decrypt(v, key) : null;
				return [k, decrypted] as [string, string | null];
			}),
		);

		return Object.fromEntries(entries) as Preferences;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) {
			return {};
		}
		throw error;
	}
}
