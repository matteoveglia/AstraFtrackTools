import type { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export async function inspectShot(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
  shotId?: string
): Promise<void> {
  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal 
    ? "all projects" 
    : `project "${projectContext.project?.name}"`;

  try {
    // Prompt for shot ID if not provided
    if (!shotId) {
      const { inputShotId } = await inquirer.prompt([
        {
          type: "input",
          name: "inputShotId",
          message: "Enter the Shot ID to inspect:",
          validate: (input) => {
            if (!input.trim()) {
              return "Shot ID is required";
            }
            return true;
          },
        },
      ]);
      shotId = inputShotId.trim();
    }

    console.log(`\n🔍 Inspecting Shot: ${shotId} (${contextDisplay})`);

    // Fetch shot details using QueryService
    const shotResponse = await withErrorHandling(
      () => queryService.queryShots(`id is "${shotId}"`),
      {
        operation: 'fetch shot details',
        entity: 'Shot',
        additionalData: { shotId, contextDisplay }
      }
    );

    if (!shotResponse?.data || shotResponse.data.length === 0) {
      console.log(`❌ Shot with ID "${shotId}" not found`);
      return;
    }

    const shot = shotResponse.data[0];

    // Display shot information
    console.log("\n🎬 Shot Details:");
    console.log(`   ID: ${shot.id}`);
    console.log(`   Name: ${shot.name}`);
    console.log(`   Status: ${shot.status?.name || "No status"}`);
    console.log(`   Parent: ${shot.parent?.name || "No parent"}`);

    // Fetch associated tasks using QueryService
    const tasksResponse = await withErrorHandling(
      () => queryService.queryTasks(`parent_id is "${shotId}"`),
      {
        operation: 'fetch shot tasks',
        entity: 'Task',
        additionalData: { shotId, contextDisplay }
      }
    );

    if (tasksResponse?.data && tasksResponse.data.length > 0) {
      console.log("\n📋 Associated Tasks:");
      tasksResponse.data.forEach((task: any) => {
        console.log(`   • ${task.name} (${task.type?.name || "Unknown type"})`);
        console.log(`     Status: ${task.status?.name || "No status"}`);
        console.log(`     ID: ${task.id}`);
      });
    } else {
      console.log("\n📋 No associated tasks found");
    }

    // Fetch latest versions using QueryService
    const versionsResponse = await withErrorHandling(
      () => queryService.queryAssetVersions(`task.parent_id is "${shotId}"`),
      {
        operation: 'fetch shot versions',
        entity: 'AssetVersion',
        additionalData: { shotId, contextDisplay }
      }
    );

    if (versionsResponse?.data && versionsResponse.data.length > 0) {
      console.log("\n📦 Latest Versions:");
      versionsResponse.data.forEach((version: any) => {
        console.log(`   • ${version.asset?.name || "Unknown asset"} v${version.version || "Unknown"}`);
        console.log(`     Task: ${version.task?.name || "Unknown task"}`);
        console.log(`     Parent: ${version.asset?.parent?.name || "Unknown parent"}`);
        console.log(`     ID: ${version.id}`);
        console.log("");
      });
    } else {
      console.log("\n📦 No versions found");
    }

    debug(`Shot inspection completed for ID: ${shotId}`);
  } catch (error) {
    handleError(error, {
      operation: 'inspect shot',
      entity: 'Shot',
      additionalData: { shotId, contextDisplay }
    });
    throw error;
  }
}
