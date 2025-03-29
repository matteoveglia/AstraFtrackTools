
// Import Deno types (Deno is a global available at runtime)
declare const Deno: any;

/**
 * Fixes an issue with inquirer in Deno where the prompt doesn't show
 * until a key is pressed. This workaround ensures the prompt is visible.
 */

// Track if we've already applied the fix
let fixApplied = false;

/**
 * Patches inquirer's prompt behavior in Deno environment.
 * This adds a small dummy input event to force the prompt to render.
 * Only applies once per application run to avoid repeated prompts.
 */
export function initInquirerPrompt(): void {
  // Only apply fix once
  if (fixApplied) {
    return;
  }
  
  // Check if running in Deno
  if (typeof Deno !== 'undefined') {
    // Add a small event after 100ms to ensure the prompt renders
    setTimeout(() => {
      // Try to send a dummy event to stdin to make inquirer render the prompt
      try {
        // Only try to write if the function exists
        if (Deno.stdin && typeof Deno.stdin.write === 'function') {
          const encoder = new TextEncoder();
          Deno.stdin.write(encoder.encode(''));
        }
        // Mark as applied regardless, since we only want to try once
        fixApplied = true;
      } catch (error) {
        // Ignore any errors, this is just a workaround
      }
    }, 100);
  }
} 