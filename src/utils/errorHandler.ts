/**
 * Enhanced error handling utility for better error reporting and debugging
 */

import { debug } from "./debug.ts";

export interface FtrackError extends Error {
	errorCode?: string;
	statusCode?: number;
	details?: unknown;
}

export interface ErrorContext {
	operation: string;
	entity?: string;
	entityId?: string;
	additionalData?: Record<string, unknown>;
}

/**
 * Enhanced error handler that provides consistent error reporting
 */
export function handleError(
	error: unknown,
	context: ErrorContext,
	options: { rethrow?: boolean; logStackTrace?: boolean } = {},
): void {
	const { operation, entity, entityId, additionalData } = context;
	const { rethrow = true, logStackTrace = true } = options;

	let errorMessage = "Unknown error occurred";
	let errorCode: string | undefined;
	let statusCode: number | undefined;
	let details: unknown;

	if (error instanceof Error) {
		errorMessage = error.message;
		const ftrackError = error as FtrackError;
		errorCode = ftrackError.errorCode;
		statusCode = ftrackError.statusCode;
		details = ftrackError.details;
	} else if (typeof error === "string") {
		errorMessage = error;
	} else {
		errorMessage = String(error);
	}

	// Create context string
	const contextParts = [operation];
	if (entity) {
		contextParts.push(`${entity}${entityId ? ` (${entityId})` : ""}`);
	}
	const contextString = contextParts.join(" - ");

	// Log error with context
	console.error(`❌ Error during ${contextString}: ${errorMessage}`);

	if (errorCode) {
		console.error(`   Error Code: ${errorCode}`);
	}

	if (statusCode) {
		console.error(`   Status Code: ${statusCode}`);
	}

	if (details) {
		console.error(`   Details: ${JSON.stringify(details, null, 2)}`);
	}

	if (additionalData) {
		debug(`Additional context: ${JSON.stringify(additionalData, null, 2)}`);
	}

	// Log stack trace in debug mode
	if (logStackTrace && error instanceof Error && error.stack) {
		debug(`Stack trace: ${error.stack}`);
	}

	if (rethrow) {
		throw error;
	}
}

/**
 * Wrapper for handling async operations with consistent error handling
 */
export async function withErrorHandling<T>(
	operation: () => Promise<T>,
	context: ErrorContext,
	options?: { rethrow?: boolean; logStackTrace?: boolean },
): Promise<T | null> {
	try {
		return await operation();
	} catch (error) {
		handleError(error, context, options);
		return null;
	}
}

/**
 * Handle Ftrack-specific errors with appropriate messaging
 */
export function handleFtrackError(error: unknown, context: string): never {
	if (error instanceof Error) {
		const ftrackError = error as FtrackError;

		switch (ftrackError.errorCode) {
			case "api_credentials_invalid":
				console.error(
					`❌ ${context}: Invalid API credentials. Please update your credentials.`,
				);
				break;
			case "permission_denied":
				console.error(
					`❌ ${context}: Permission denied. You may not have the required permissions for this operation.`,
				);
				break;
			case "entity_not_found":
				console.error(
					`❌ ${context}: Entity not found. The requested resource may have been deleted or you may not have access.`,
				);
				break;
			case "validation_error":
				console.error(
					`❌ ${context}: Validation error. The data provided is invalid.`,
				);
				if (ftrackError.details) {
					console.error(
						`   Details: ${JSON.stringify(ftrackError.details, null, 2)}`,
					);
				}
				break;
			default:
				console.error(`❌ ${context}: ${ftrackError.message}`);
				break;
		}

		debug(`Full error details: ${JSON.stringify(ftrackError, null, 2)}`);
		if (ftrackError.stack) {
			debug(`Stack trace: ${ftrackError.stack}`);
		}
	} else {
		console.error(`❌ ${context}: ${String(error)}`);
	}

	throw error;
}

/**
 * Validate required parameters and throw descriptive errors
 */
export function validateRequired<T>(
	value: T | null | undefined,
	paramName: string,
	context: string,
): asserts value is T {
	if (value === null || value === undefined) {
		throw new Error(`${context}: Missing required parameter '${paramName}'`);
	}
}

/**
 * Retry operation with exponential backoff
 */
export async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	options: {
		maxRetries?: number;
		initialDelay?: number;
		maxDelay?: number;
		backoffFactor?: number;
		context?: string;
	} = {},
): Promise<T> {
	const {
		maxRetries = 3,
		initialDelay = 1000,
		maxDelay = 10000,
		backoffFactor = 2,
		context = "operation",
	} = options;

	let lastError: Error;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === maxRetries) {
				console.error(`❌ ${context} failed after ${maxRetries} attempts`);
				break;
			}

			const delay = Math.min(
				initialDelay * backoffFactor ** (attempt - 1),
				maxDelay,
			);
			console.warn(
				`⚠️ ${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
			);
			debug(`Retry error: ${lastError.message}`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}
