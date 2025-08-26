/**
 * Cliffy initialization utilities for AstraFtrackTools CLI prompts.
 *
 * This module replaces the previous inquirerInit.ts as part of the migration
 * from Inquirer.js to Cliffy to resolve the persistent first keypress issue
 * and improve Deno compatibility.
 *
 * Cliffy is designed to work natively with Deno and should not require
 * the workarounds that were necessary with Inquirer.js.
 */

/**
 * Initialize Cliffy prompt environment.
 *
 * Unlike the previous Inquirer.js implementation, Cliffy is designed to work
 * natively with Deno's TTY interface and should not require special initialization
 * or workarounds for the first keypress issue.
 *
 * This function is maintained for backward compatibility during the migration
 * but may be removed once all files are migrated and tested.
 */
export function initCliffyPrompt(): void {
  // Cliffy handles TTY initialization natively - no special setup required
  // This function is maintained for consistency during migration
}

/**
 * Legacy compatibility function for existing code during migration.
 *
 * @deprecated Use initCliffyPrompt() instead. This will be removed after migration.
 */
export function initInquirerPrompt(): void {
  // Redirect to Cliffy initialization for backward compatibility
  initCliffyPrompt();
}
