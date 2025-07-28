import type { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export async function inspectTask(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
  taskId?: string
): Promise<void> {
  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal 
    ? "all projects" 
    : `project "${projectContext.project?.name}"`;

  try {
    // Prompt for task ID if not provided
    if (!taskId) {
      const { inputTaskId } = await inquirer.prompt([
        {
          type: "input",
          name: "inputTaskId",
          message: "Enter the Task ID to inspect:",
          validate: (input) => {
            if (!input.trim()) {
              return "Task ID is required";
            }
            return true;
          },
        },
      ]);
      taskId = inputTaskId.trim();
    }

    console.log(`\n🔍 Inspecting Task: ${taskId} (${contextDisplay})`);

    // Fetch task details using QueryService
    const taskResponse = await withErrorHandling(
      () => queryService.queryTasks(`id is "${taskId}"`),
      {
        operation: 'fetch task details',
        entity: 'Task',
        additionalData: { taskId, contextDisplay }
      }
    );

    if (!taskResponse?.data || taskResponse.data.length === 0) {
      console.log(`❌ Task with ID "${taskId}" not found`);
      return;
    }

    const task = taskResponse.data[0];

    // Display task information
    console.log("\n📋 Task Details:");
    console.log(`   ID: ${task.id}`);
    console.log(`   Name: ${task.name}`);
    console.log(`   Type: ${task.type?.name || "Unknown type"}`);
    console.log(`   Status: ${task.status?.name || "No status"}`);
    console.log(`   Parent: ${task.parent?.name || "No parent"}`);

    // Fetch time logs using direct session query (time logs don't need project scoping)
    const timeLogsResponse = await withErrorHandling(
      () => session.query(`
        select 
          id,
          duration,
          start,
          comment,
          user.first_name,
          user.last_name,
          user.username
        from Timelog 
        where context_id="${taskId}"
        order by start desc
        limit 10
      `),
      {
        operation: 'fetch task time logs',
        entity: 'Timelog',
        additionalData: { taskId, contextDisplay }
      }
    );

    if (timeLogsResponse?.data && timeLogsResponse.data.length > 0) {
      console.log("\n⏰ Recent Time Logs (last 10):");
      timeLogsResponse.data.forEach((log: any) => {
        const duration = log.duration ? `${(log.duration / 3600).toFixed(2)}h` : "Unknown duration";
        const start = log.start ? new Date(log.start).toLocaleString() : "Unknown start";
        const user = log.user ? `${log.user.first_name} ${log.user.last_name} (${log.user.username})` : "Unknown user";
        
        console.log(`   • ${duration} - ${user}`);
        console.log(`     Start: ${start}`);
        console.log(`     Comment: ${log.comment || "No comment"}`);
        console.log(`     ID: ${log.id}`);
        console.log("");
      });
    } else {
      console.log("\n⏰ No time logs found");
    }

    // Fetch associated versions using QueryService
    const versionsResponse = await withErrorHandling(
      () => queryService.queryAssetVersions(`task_id is "${taskId}"`),
      {
        operation: 'fetch task versions',
        entity: 'AssetVersion',
        additionalData: { taskId, contextDisplay }
      }
    );

    if (versionsResponse?.data && versionsResponse.data.length > 0) {
      console.log("\n📦 Associated Versions:");
      versionsResponse.data.forEach((version: any) => {
        console.log(`   • ${version.asset?.name || "Unknown asset"} v${version.version || "Unknown"}`);
        console.log(`     Task: ${version.task?.name || "Unknown task"}`);
        console.log(`     Parent: ${version.asset?.parent?.name || "Unknown parent"}`);
        console.log(`     ID: ${version.id}`);
        console.log("");
      });
    } else {
      console.log("\n📦 No associated versions found");
    }

    debug(`Task inspection completed for ID: ${taskId}`);
  } catch (error) {
    handleError(error, {
      operation: 'inspect task',
      entity: 'Task',
      additionalData: { taskId, contextDisplay }
    });
    throw error;
  }
}
