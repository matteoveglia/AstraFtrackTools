/**
 * Debug utility for conditional logging
 */

// ANSI escape codes for colors
const colors = {
    bgDarkRed: '\x1b[41m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

let debugMode = false;

export function setDebugMode(enabled: boolean) {
    debugMode = enabled;
}

interface FtrackError extends Error {
    errorCode: string;
}

/**
 * Check if debug mode is enabled via DEBUG environment variable
 */
export const isDebugMode = (): boolean => {
    return Deno.args.includes('DEBUG');
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

export function handleError(error: unknown): string {
    if (debugMode) {
        debug('Detailed error:', error);
    }
    
    // Handle Ftrack ServerError type
    if (error && typeof error === 'object' && 'errorCode' in error) {
        const ftrackError = error as FtrackError;
        switch (ftrackError.errorCode) {
            case 'api_credentials_invalid':
                return 'Invalid API credentials. Please check your API credentials and try again.';
            case 'connection_error':
                return 'Could not connect to Ftrack server. Please check your server URL and internet connection.';
            default:
                return `Ftrack error: ${ftrackError.errorCode}`;
        }
    }
    
    return 'An unexpected error occurred';
}
