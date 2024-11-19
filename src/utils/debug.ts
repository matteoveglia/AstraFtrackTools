/**
 * Debug utility for conditional logging
 */

// ANSI escape codes for colors
const colors = {
    bgDarkRed: '\x1b[41m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

/**
 * Check if debug mode is enabled via DEBUG environment variable
 */
export const isDebugMode = (): boolean => {
    return process.env.DEBUG === 'true';
};

/**
 * Debug logging function that only logs when DEBUG=true
 * Formats the [DEBUG] prefix with a dark red background
 */
export const debug = (...args: unknown[]): void => {
    if (isDebugMode()) {
        const debugPrefix = `${colors.bgDarkRed}${colors.bright}[DEBUG]${colors.reset}`;
        console.log(debugPrefix, ...args);
    }
};
