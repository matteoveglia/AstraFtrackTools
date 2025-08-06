/**
 * Debug utility for conditional logging
 */

// ANSI escape codes for colors
const colors = {
  bgDarkRed: "\x1b[41m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

/**
 * Check if debug mode is enabled via DEBUG environment variable
 */
export const isDebugMode = (): boolean => {
  return Deno.args.includes("DEBUG");
};

/**
 * Debug logging function that only logs when DEBUG=true
 * Formats the [DEBUG] prefix with a dark red background
 */
export let debug = (...args: unknown[]): void => {
  if (isDebugMode()) {
    const debugPrefix =
      `${colors.bgDarkRed}${colors.bright}[DEBUG]${colors.reset}`;
    console.log(debugPrefix, ...args);
  }
};

/**
 * Override the debug implementation (used in tests)
 */
export const setDebugLogger = (logger: (...args: unknown[]) => void): void => {
  debug = logger;
};

/**
 * Debug logging function that writes to a specific file
 * Always logs regardless of debug mode for troubleshooting
 */
export const debugToFile = async (filePath: string, ...args: unknown[]): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}\n`;
    
    await Deno.writeTextFile(filePath, message, { append: true });
  } catch (error) {
    console.error('Failed to write debug log:', error);
  }
};
