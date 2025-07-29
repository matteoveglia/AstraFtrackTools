import { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { updateLatestVersionsSent } from "./tools/updateLatestVersions.ts";
import { exportSchema } from "./tools/exportSchema.ts";
import { inspectVersion } from "./tools/inspectVersion.ts";
import { inspectShot } from "./tools/inspectShot.ts";
import { inspectTask } from "./tools/inspectTask.ts";
import { propagateThumbnails } from "./tools/propagateThumbnails.ts";
import { debug } from "./utils/debug.ts";
import { loadPreferences, savePreferences } from "./utils/preferences.ts";
import { inspectNote } from "./tools/inspectNote.ts";
import { manageLists } from "./tools/manageLists.ts";
import { initInquirerPrompt } from "./utils/inquirerInit.ts";
import { selectProject, displayProjectContext, type ProjectContext } from "./utils/projectSelection.ts";
import { SessionService } from "./services/session.ts";
import { ProjectContextService } from "./services/projectContext.ts";
import { QueryService } from "./services/queries.ts";
import { debugPrompt } from "./utils/inputDebug.ts";

// Import Deno types (Deno is a global available at runtime)
declare const Deno: {
  hostname(): string;
  exit(code?: number): never;
};

// Global services
let sessionService: SessionService;
let projectContextService: ProjectContextService;
let queryService: QueryService;

interface ServerError extends Error {
  errorCode?: string;
}

// Initialize ftrack session and project context
async function initSession(): Promise<{ session: Session; projectContext: ProjectContext }> {
  debug("Loading preferences");
  const prefs = await loadPreferences();

  if (!prefs.FTRACK_SERVER || !prefs.FTRACK_API_USER || !prefs.FTRACK_API_KEY) {
    console.log("\n🚀 Welcome to Astra Ftrack Tools!");
    console.log("First-time setup required. Let's configure your Ftrack credentials.\n");
    const configured = await setAndTestCredentials();
    if (!configured) {
      throw new Error("Setup cancelled - credentials are required to proceed");
    }
    return initSession(); // Retry with new credentials
  }

  console.log("Initializing ftrack session...");
  try {
    const session = new Session(
      prefs.FTRACK_SERVER,
      prefs.FTRACK_API_USER,
      prefs.FTRACK_API_KEY,
      { autoConnectEventHub: false },
    );
    await session.initializing;
    debug("Successfully connected to ftrack");
    
    // Initialize services
    sessionService = new SessionService(session);
    
    // Project selection
    console.log("\n📁 Project Selection");
    console.log("===================");
    const projectContext = await selectProject(session);
    
    projectContextService = new ProjectContextService(projectContext);
    queryService = new QueryService(sessionService, projectContextService);
    
    console.log(`\n✅ Ready! Operating in: ${displayProjectContext(projectContext)}\n`);
    
    return { session, projectContext };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const serverError = error as ServerError;
      if (serverError?.errorCode === 'api_credentials_invalid') {
        console.error('\nError: Invalid API credentials. Please update your credentials.');
        const updated = await setAndTestCredentials();
        if (updated) {
          return initSession(); // Retry with new credentials
        }
        throw new Error('Unable to proceed with invalid credentials');
      }
      throw error;
    } else {
      throw new Error(`Unknown error: ${error}`);
    }
  }
}

// Add this type definition before the Tool interface
type ToolResult = void | boolean | Record<string, unknown>;

interface Tool {
  name: string;
  value: string;
  description: string;
  subMenu?: { name: string; value: string }[];
  action?: () => Promise<ToolResult>;
}

type ExportFormat = "json" | "yaml" | "csv" | "ts";

async function testFtrackCredentials(
  server: string,
  user: string,
  key: string,
): Promise<boolean> {
  try {
    debug("Testing Ftrack credentials...");
    const testSession = new Session(server, user, key, {
      autoConnectEventHub: false,
    });
    await testSession.initializing;
    debug("Credentials test successful");
    return true;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const serverError = error as ServerError;
      if (serverError?.errorCode === 'api_credentials_invalid') {
        console.error('\nError: The supplied API key is not valid.');
        return false;
      }
      console.error("Failed to authenticate with Ftrack:", error);
      return false;
    } else {
      console.error("Failed to authenticate with Ftrack:", error);
      return false;
    }
  }
}

async function setAndTestCredentials(): Promise<boolean> {
  while (true) { // Loop until valid credentials or user quits
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "server",
        message: "Ftrack Server URL:",
        default: (await loadPreferences()).FTRACK_SERVER,
      },
      {
        type: "input",
        name: "user",
        message: "API User:",
        default: (await loadPreferences()).FTRACK_API_USER,
      },
      {
        type: "password",
        name: "key",
        message: "API Key:",
        mask: "*",
      },
    ]);

    const shouldTest = await inquirer.prompt([{
      type: "confirm",
      name: "test",
      message: "Would you like to test these credentials?",
      default: true,
    }]);

    if (shouldTest.test) {
      const isValid = await testFtrackCredentials(
        answers.server,
        answers.user,
        answers.key,
      );
      if (!isValid) {
        const retry = await inquirer.prompt([{
          type: "confirm",
          name: "again",
          message: "Would you like to try again?",
          default: true,
        }]);

        if (!retry.again) {
          return false; // User chose to quit
        }
        continue; // Try again
      }
    }

    await savePreferences({
      FTRACK_SERVER: answers.server,
      FTRACK_API_USER: answers.user,
      FTRACK_API_KEY: answers.key,
    });

    console.log("Credentials saved successfully");
    return true;
  }
}

// Available tools
const tools: Tool[] = [
  {
    name: "🌐 Update Latest Versions Sent",
    value: "updateVersions",
    description: "Updates all shots with their latest delivered version",
  },
  {
    name: "🌐 Export Schema",
    value: "exportSchema",
    description:
      "Exports schema information for major entity types including custom attributes",
    subMenu: [
      { name: "Export to JSON", value: "json" },
      { name: "Export to YAML", value: "yaml" },
      { name: "Export to CSV", value: "csv" },
      { name: "Generate TypeScript (.ts) file", value: "ts" },
    ],
  },
  {
    name: "🌐 Inspect Version",
    value: "inspectVersion",
    description: "Inspect a specific version's relationships",
  },
  {
    name: "🌐 Inspect Shot",
    value: "inspectShot",
    description: "Inspect a specific shot's details and relationships",
  },
  {
    name: "🌐 Inspect Task",
    value: "inspectTask",
    description: "Inspect a specific task's details and time logs",
  },
  {
    name: "🌐 Inspect Note",
    value: "inspectNote",
    description: "Inspect a specific note and its attachments",
  },
  {
    name: "📁 Manage Lists",
    value: "manageLists",
    description: "Manage lists and add shots to them by code",
  },
  {
    name: "📁 Propagate Thumbnails",
    value: "propagateThumbnails",
    description:
      "Update shots with thumbnails from their latest asset versions",
  },
  {
    name: "🌐 Set Ftrack Credentials",
    value: "set-credentials",
    description: "Configure Ftrack API credentials",
    action: setAndTestCredentials,
  },
  {
    name: "🔧 Test First Keypress Issue",
    value: "test-keypress",
    description: "Phase 7 debugging: Test first keypress issue",
    action: async () => {
      const { testFirstKeypressIssue } = await import("./utils/inputDebug.ts");
      await testFirstKeypressIssue();
    },
  },
  {
    name: "🔧 Test Input Workarounds",
    value: "test-workarounds",
    description: "Phase 7.3: Test different workarounds for input issue",
    action: async () => {
      const { testWorkarounds } = await import("./utils/inputDebug.ts");
      await testWorkarounds();
    },
  },
  {
    name: "🔧 Analyze Input Events",
    value: "analyze-events",
    description: "Phase 7.3: Detailed input event analysis",
    action: async () => {
      const { analyzeInputEvents } = await import("./utils/inputDebug.ts");
      await analyzeInputEvents();
    },
  },
];

// Main menu questions - will be updated with project context
const menuQuestion = {
  type: "list",
  name: "tool",
  message: "Select a tool to run:",
  choices: [
    ...tools.map((tool) => ({
      name: `${tool.name} - ${tool.description}`,
      value: tool.value,
    })),
    { name: "Change Project", value: "change-project" },
    { name: "Exit", value: "exit" },
  ],
} as const;

// Function to update menu with project context
function updateMenuWithContext(projectContext: ProjectContext) {
  const contextDisplay = displayProjectContext(projectContext);
  return {
    type: "list" as const,
    name: "tool" as const,
    message: `[${contextDisplay}] Select a tool to run:`,
    choices: [
      ...tools.map((tool) => ({
        name: `${tool.name} - ${tool.description}`,
        value: tool.value,
      })),
      { name: "Change Project", value: "change-project" },
      { name: "Exit", value: "exit" },
    ],
  };
}

// After tool completion question
const continueQuestion = {
  type: "confirm",
  name: "cont",
  message: "Would you like to run another tool?",
  default: true,
} as const;

async function runTool(
  session: Session,
  tool: string,
  subOption?: ExportFormat,
) {
  debug(
    `Running tool: ${tool}${subOption ? ` with option: ${subOption}` : ""}`,
  );
  switch (tool) {
    case "updateVersions":
      await updateLatestVersionsSent(session, projectContextService, queryService);
      break;
    case "exportSchema":
      if (subOption) {
        const result = await exportSchema(session, projectContextService, subOption);
        if (typeof result === 'object' && result !== null) {
          // Use type assertion to handle the result correctly
          const exportResult = result as { filename: string };
          if ('filename' in exportResult) {
            console.log(`Schema exported successfully to ${exportResult.filename}`);
          } else {
            console.log('Schema export completed');
          }
        } else {
          console.log('Schema export completed');
        }
      }
      break;
    case "inspectVersion":
      await inspectVersion(session, projectContextService, queryService);
      break;
    case "inspectShot":
      await inspectShot(session, projectContextService, queryService);
      break;
    case "inspectTask":
      await inspectTask(session, projectContextService, queryService);
      break;
    case "inspectNote":
      await inspectNote(session, projectContextService, queryService);
      break;
    case "manageLists":
      await manageLists(session, projectContextService);
      break;
    case "propagateThumbnails":
      await propagateThumbnails(session, projectContextService, queryService);
      break;
    case "set-credentials":
    case "test-keypress":
    case "test-workarounds":
    case "analyze-events": {
      const selectedTool = tools.find((t) => t.value === tool);
      if (selectedTool?.action) {
        await selectedTool.action();
      }
      break;
    }
    default:
      console.log(`Unknown tool: ${tool}`);
  }
  debug(`Completed tool: ${tool}`);
}

// Main function
async function main() {
  console.log("Astra Ftrack Tools");
  console.log("==================");

  // Apply inquirer fix for Deno environment (now no-op for Phase 7 investigation)
  initInquirerPrompt();

  try {
    const { session, projectContext } = await initSession();
    let currentProjectContext = projectContext;

    let running = true;

    while (running) {
      // Use the appropriate menu based on project context
      const currentMenu = currentProjectContext 
        ? updateMenuWithContext(currentProjectContext)
        : menuQuestion;
      
      // Phase 7.2: Use debugPrompt for main menu to track input state
      const { tool } = await debugPrompt(currentMenu, "Main menu selection");

      if (tool === "exit") {
        running = false;
        continue;
      }

      if (tool === "change-project") {
        // Re-run project selection
        currentProjectContext = await selectProject(session);
        // Update the project context service with the new context
        projectContextService.setContext(currentProjectContext);
        continue;
      }

      const selectedTool = tools.find((t) => t.value === tool);

      if (selectedTool?.subMenu) {
        // Phase 7.2: Use debugPrompt for submenu to track input state after main menu
        const { subOption } = await debugPrompt({
          type: "list",
          name: "subOption",
          message: `Select ${selectedTool.name} option:`,
          choices: selectedTool.subMenu,
        }, "Submenu selection after main menu");

        await runTool(session, tool, subOption);
      } else {
        await runTool(session, tool);
      }

      // Phase 7.2: Use debugPrompt for continue question to track input state after tool completion
      const { cont } = await debugPrompt(continueQuestion, "Continue question after tool completion");

      running = cont;
    }

    console.log("Exiting Astra Ftrack Tools. Goodbye!");
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

main();
