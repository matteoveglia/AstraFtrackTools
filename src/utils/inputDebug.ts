/**
 * Phase 7.2-7.3: Input debugging utility for investigating the first keypress issue.
 * This module provides detailed logging of stdin/stdout state and inquirer behavior
 * during prompt transitions to identify the root cause of input buffering problems.
 * 
 * Phase 7.3 additions:
 * - Input event tracking
 * - Potential workaround implementations
 * - Enhanced debugging for keypress detection
 */

import { debug } from "./debug.ts";
import * as path from "https://deno.land/std/path/mod.ts";

// Track prompt sequence for debugging
let promptSequence = 0;
let inputEventListeners: Array<() => void> = [];

// Setup log file path
const LOG_FILE = path.join(Deno.cwd(), "input-debug.log");

/**
 * Writes a debug message to the log file
 */
async function writeToLog(message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  await Deno.writeTextFile(LOG_FILE, logMessage, { append: true });
}

/**
 * Sets up input event listeners to track keypress events
 */
function setupInputEventTracking(context: string): void {
  if (typeof process !== 'undefined' && process.stdin) {
    const dataListener = (chunk: any) => {
      writeToLog(`[INPUT-EVENT-${promptSequence}] ${context} - stdin data: ${JSON.stringify(chunk.toString())}`);
    };
    
    const keypressListener = (str: string, key: any) => {
      writeToLog(`[INPUT-EVENT-${promptSequence}] ${context} - keypress: str="${str}", key=${JSON.stringify(key)}`);
    };
    
    process.stdin.on('data', dataListener);
    process.stdin.on('keypress', keypressListener);
    
    // Store cleanup functions
    inputEventListeners.push(() => {
      process.stdin.off('data', dataListener);
      process.stdin.off('keypress', keypressListener);
    });
  }
}

/**
 * Cleans up input event listeners
 */
function cleanupInputEventTracking(): void {
  inputEventListeners.forEach(cleanup => cleanup());
  inputEventListeners = [];
}

/**
 * Potential workaround: Add a small delay before prompts
 */
async function delayWorkaround(ms: number = 50): Promise<void> {
  await writeToLog(`[WORKAROUND-${promptSequence}] Adding ${ms}ms delay before prompt`);
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Potential workaround: Force stdin to be ready
 */
async function forceStdinReady(): Promise<void> {
  await writeToLog(`[WORKAROUND-${promptSequence}] Forcing stdin ready state`);
  
  if (typeof process !== 'undefined' && process.stdin) {
    // Ensure stdin is in raw mode and ready
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.setRawMode(false);
    }
    
    // Resume stdin if paused
    if (process.stdin.resume) {
      process.stdin.resume();
    }
  }
}

/**
 * Potential workaround: Send a dummy keypress to prime the input
 */
async function primeInputWorkaround(): Promise<void> {
  await writeToLog(`[WORKAROUND-${promptSequence}] Priming input with dummy keypress`);
  
  if (typeof process !== 'undefined' && process.stdin) {
    // Emit a dummy keypress event that shouldn't affect the prompt
    process.stdin.emit('keypress', '', { name: 'escape', ctrl: false, meta: false, shift: false });
  }
}

/**
 * Logs the current state of Deno's stdin and stdout for debugging purposes
 */
async function logTerminalState(context: string): Promise<void> {
  promptSequence++;
  
  await writeToLog(`[INPUT-DEBUG-${promptSequence}] ${context}`);
  await writeToLog(`[INPUT-DEBUG-${promptSequence}] Deno available: ${typeof Deno !== 'undefined'}`);
  
  if (typeof Deno !== 'undefined') {
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] Deno.stdin available: ${!!Deno.stdin}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] Deno.stdout available: ${!!Deno.stdout}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] Deno.stdin.isTerminal(): ${Deno.stdin?.isTerminal()}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] Deno.stdout.isTerminal(): ${Deno.stdout?.isTerminal()}`);
  }
  
  // Log process.stdin/stdout state if available (for inquirer compatibility)
  if (typeof process !== 'undefined') {
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] process.stdin available: ${!!process.stdin}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] process.stdout available: ${!!process.stdout}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] process.stdin.isTTY: ${process.stdin?.isTTY}`);
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] process.stdout.isTTY: ${process.stdout?.isTTY}`);
  }
}

/**
 * Wrapper function for inquirer.prompt that adds extensive debugging
 * to track input state before and after prompt calls
 */
export async function debugPrompt<T extends Record<string, any> = Record<string, any>>(
  questions: any,
  context: string = "unknown"
): Promise<T> {
  const inquirer = await import("npm:inquirer");
  
  await logTerminalState(`BEFORE prompt - ${context}`);
  setupInputEventTracking(context);
  
  try {
    const result = await inquirer.default.prompt(questions) as T;
    await logTerminalState(`AFTER prompt - ${context}`);
    cleanupInputEventTracking();
    return result;
  } catch (error) {
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] ERROR during prompt - ${context}: ${error}`);
    await logTerminalState(`ERROR prompt - ${context}`);
    cleanupInputEventTracking();
    throw error;
  }
}

/**
 * Enhanced debug prompt with workaround testing
 */
export async function debugPromptWithWorkaround<T extends Record<string, any> = Record<string, any>>(
  questions: any,
  context: string = "unknown",
  workaround: "delay" | "force-ready" | "prime" | "none" = "none"
): Promise<T> {
  const inquirer = await import("npm:inquirer");
  
  await logTerminalState(`BEFORE prompt - ${context} (workaround: ${workaround})`);
  setupInputEventTracking(context);
  
  // Apply workaround if specified
  switch (workaround) {
    case "delay":
      await delayWorkaround();
      break;
    case "force-ready":
      await forceStdinReady();
      break;
    case "prime":
      await primeInputWorkaround();
      break;
  }
  
  try {
    const result = await inquirer.default.prompt(questions) as T;
    await logTerminalState(`AFTER prompt - ${context} (workaround: ${workaround})`);
    cleanupInputEventTracking();
    return result;
  } catch (error) {
    await writeToLog(`[INPUT-DEBUG-${promptSequence}] ERROR during prompt - ${context}: ${error}`);
    await logTerminalState(`ERROR prompt - ${context} (workaround: ${workaround})`);
    cleanupInputEventTracking();
    throw error;
  }
}

/**
 * Test function to check if the first keypress issue is present
 * This can be called manually during testing to verify behavior
 */
export async function testFirstKeypressIssue(): Promise<void> {
  console.log("\n=== Testing First Keypress Issue ===");
  console.log("This test will show multiple prompts in sequence.");
  console.log("Pay attention to whether the first keypress is ignored after each prompt.");
  console.log(`Debug logs will be written to: ${LOG_FILE}\n`);
  
  // Test 1: Simple text input
  await debugPrompt({
    type: "input",
    name: "test1",
    message: "Test 1 - Type something (watch for first keypress):"
  }, "Test 1 - Simple input");
  
  // Test 2: List selection followed by text input
  await debugPrompt({
    type: "list",
    name: "test2",
    message: "Test 2 - Select an option:",
    choices: ["Option A", "Option B", "Option C"]
  }, "Test 2 - List selection");
  
  await debugPrompt({
    type: "input",
    name: "test3",
    message: "Test 3 - Type something after list selection (watch for first keypress):"
  }, "Test 3 - Input after list");
  
  // Test 3: Confirm prompt followed by text input
  await debugPrompt({
    type: "confirm",
    name: "test4",
    message: "Test 4 - Confirm something:",
    default: true
  }, "Test 4 - Confirm");
  
  await debugPrompt({
    type: "input",
    name: "test5",
    message: "Test 5 - Type something after confirm (watch for first keypress):"
  }, "Test 5 - Input after confirm");
  
  console.log("\n=== Test Complete ===");
  console.log(`Check the debug logs at ${LOG_FILE} for any patterns in stdin/stdout state changes.`);
}

/**
 * Phase 7.3: Test different workarounds systematically
 */
export async function testWorkarounds(): Promise<void> {
  console.log("\n=== Testing Workarounds for First Keypress Issue ===");
  console.log("This will test different potential solutions systematically.");
  console.log(`Debug logs will be written to: ${LOG_FILE}\n`);
  
  // Test baseline (no workaround)
  console.log("Testing baseline (no workaround)...");
  await debugPromptWithWorkaround({
    type: "input",
    name: "baseline",
    message: "Baseline test - Type something (watch for first keypress):"
  }, "Baseline test", "none");
  
  // Test delay workaround
  console.log("\nTesting delay workaround...");
  await debugPromptWithWorkaround({
    type: "input",
    name: "delay",
    message: "Delay test - Type something (50ms delay applied):"
  }, "Delay test", "delay");
  
  // Test force stdin ready workaround
  console.log("\nTesting force stdin ready workaround...");
  await debugPromptWithWorkaround({
    type: "input",
    name: "force",
    message: "Force ready test - Type something (stdin forced ready):"
  }, "Force ready test", "force-ready");
  
  // Test prime input workaround
  console.log("\nTesting prime input workaround...");
  await debugPromptWithWorkaround({
    type: "input",
    name: "prime",
    message: "Prime test - Type something (dummy keypress sent):"
  }, "Prime test", "prime");
  
  console.log("\n=== Workaround Tests Complete ===");
  console.log(`Check the debug logs at ${LOG_FILE} to compare the effectiveness of different workarounds.`);
}

/**
 * Phase 7.3: Comprehensive input event analysis
 */
export async function analyzeInputEvents(): Promise<void> {
  console.log("\n=== Analyzing Input Events ===");
  console.log("This test focuses on detailed input event tracking.");
  console.log(`Debug logs will be written to: ${LOG_FILE}\n`);
  
  // Enable keypress events for process.stdin
  if (typeof process !== 'undefined' && process.stdin && typeof process.stdin.setRawMode === 'function') {
    const readline = await import("node:readline");
    readline.emitKeypressEvents(process.stdin);
  }
  
  console.log("Test 1: Single character input with detailed event tracking");
  await debugPrompt({
    type: "input",
    name: "event1",
    message: "Type a single character and press Enter:"
  }, "Event analysis 1");
  
  console.log("\nTest 2: Multiple character input with detailed event tracking");
  await debugPrompt({
    type: "input",
    name: "event2",
    message: "Type multiple characters and press Enter:"
  }, "Event analysis 2");
  
  console.log("\nTest 3: List navigation with detailed event tracking");
  await debugPrompt({
    type: "list",
    name: "event3",
    message: "Navigate this list with arrow keys:",
    choices: ["First option", "Second option", "Third option", "Fourth option"]
  }, "Event analysis 3");
  
  console.log("\n=== Input Event Analysis Complete ===");
  console.log(`Check the debug logs at ${LOG_FILE} for detailed input event information.`);
}