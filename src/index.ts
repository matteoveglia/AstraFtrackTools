import { Session } from "@ftrack/api";

import { Select, Input, Confirm, Secret } from "@cliffy/prompt";
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
import { initCliffyPrompt } from "./utils/cliffyInit.ts";
import { selectProject, displayProjectContext, type ProjectContext } from "./utils/projectSelection.ts";
import { SessionService } from "./services/session.ts";
import { ProjectContextService } from "./services/projectContext.ts";
import { QueryService } from "./services/queries.ts";


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
    const prefs = await loadPreferences();
    
    const server = await Input.prompt({
      message: "Ftrack Server URL:",
      default: prefs.FTRACK_SERVER,
    });

    const user = await Input.prompt({
      message: "API User:",
      default: prefs.FTRACK_API_USER,
    });

    const key = await Secret.prompt({
       message: "API Key:",
     });

    const shouldTest = await Confirm.prompt({
      message: "Would you like to test these credentials?",
      default: true,
    });

    if (shouldTest) {
      const isValid = await testFtrackCredentials(
        server,
        user,
        key,
      );
      if (!isValid) {
        const retry = await Confirm.prompt({
          message: "Would you like to try again?",
          default: true,
        });

        if (!retry) {
          return false; // User chose to quit
        }
        continue; // Try again
      }
    }

    await savePreferences({
      FTRACK_SERVER: server,
      FTRACK_API_USER: user,
      FTRACK_API_KEY: key,
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

];

// Function to update menu with project context - no longer needed with Cliffy
// Keeping for reference during migration

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
    case "set-credentials": {
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

  // Apply cliffy initialization for Deno environment
  initCliffyPrompt();

  try {
    const { session, projectContext } = await initSession();
    let currentProjectContext = projectContext;

    let running = true;

    while (running) {
      const tool = await Select.prompt({
        message: currentProjectContext 
          ? `[${displayProjectContext(currentProjectContext)}] Select a tool to run:`
          : "Select a tool to run:",
        options: [
          ...tools.map((tool) => ({
            name: `${tool.name} - ${tool.description}`,
            value: tool.value,
          })),
          { name: "Change Project", value: "change-project" },
          { name: "Exit", value: "exit" },
        ],
      });

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
        const subOption = await Select.prompt({
          message: `Select ${selectedTool.name} option:`,
          options: selectedTool.subMenu,
        });

        await runTool(session, tool, subOption as ExportFormat);
      } else {
        await runTool(session, tool);
      }

      const cont = await Confirm.prompt({
        message: "Would you like to run another tool?",
        default: true,
      });

      running = cont;
    }

    console.log("Exiting Astra Ftrack Tools. Goodbye!");
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

main();
