type Preferences = {
  FTRACK_SERVER?: string;
  FTRACK_API_USER?: string;
  FTRACK_API_KEY?: string;
};

function getPreferencesPath(): string {
  const appName = 'astra-ftrack-tools';
  
  switch (Deno.build.os) {
    case 'windows':
      return `${Deno.env.get('APPDATA')}\\${appName}\\preferences.json`;
    case 'darwin':
      return `${Deno.env.get('HOME')}/Library/Application Support/${appName}/preferences.json`;
    case 'linux':
      return `${Deno.env.get('HOME')}/.config/${appName}/preferences.json`;
    default:
      throw new Error('Unsupported operating system');
  }
}

async function ensurePreferencesDir(): Promise<void> {
  const prefsPath = getPreferencesPath();
  const prefsDir = prefsPath.slice(0, prefsPath.lastIndexOf(Deno.build.os === 'windows' ? '\\' : '/'));
  
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
  
  // Convert values to base64
  const encodedPrefs = Object.fromEntries(
    Object.entries(prefs).map(([key, value]) => [
      key,
      value ? btoa(value) : null
    ])
  );
  
  await Deno.writeTextFile(
    getPreferencesPath(),
    JSON.stringify(encodedPrefs, null, 2)
  );
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const content = await Deno.readTextFile(getPreferencesPath());
    const encodedPrefs = JSON.parse(content);
    
    // Decode base64 values
    return Object.fromEntries(
      Object.entries(encodedPrefs).map(([key, value]) => [
        key,
        value ? atob(value as string) : null
      ])
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw error;
  }
}
