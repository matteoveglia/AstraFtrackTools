import type { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export async function inspectVersion(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
  versionId?: string
): Promise<void> {
  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal 
    ? "all projects" 
    : `project "${projectContext.project?.name}"`;

  try {
    // Prompt for version ID if not provided
    if (!versionId) {
      const { inputVersionId } = await inquirer.prompt([
        {
          type: "input",
          name: "inputVersionId",
          message: "Enter the Version ID to inspect:",
          validate: (input) => {
            if (!input.trim()) {
              return "Version ID is required";
            }
            return true;
          },
        },
      ]);
      versionId = inputVersionId.trim();
    }

    console.log(`\n🔍 Inspecting Version: ${versionId} (${contextDisplay})`);

    // Fetch version details using QueryService
    const versionResponse = await withErrorHandling(
      () => queryService.queryAssetVersions(`id is "${versionId}"`),
      {
        operation: 'fetch version details',
        entity: 'AssetVersion',
        additionalData: { versionId, contextDisplay }
      }
    );

    if (!versionResponse?.data || versionResponse.data.length === 0) {
      console.log(`❌ Version with ID "${versionId}" not found`);
      return;
    }

    const version = versionResponse.data[0];

    // Display version information
    console.log("\n📦 Version Details:");
    console.log(`   ID: ${version.id}`);
    console.log(`   Asset: ${version.asset?.name || "Unknown asset"}`);
    console.log(`   Version: ${version.version || "Unknown"}`);
    console.log(`   Status: ${version.status?.name || "No status"}`);
    console.log(`   Task: ${version.task?.name || "No task"}`);
    console.log(`   User: ${version.user?.first_name} ${version.user?.last_name} (${version.user?.username})`);
    console.log(`   Date: ${version.date ? new Date(version.date).toLocaleString() : "Unknown"}`);
    console.log(`   Comment: ${version.comment || "No comment"}`);

    // Fetch custom attribute links using direct session query (custom attributes don't need project scoping)
    const customAttributeLinksResponse = await withErrorHandling(
      () => session.query(`
        select 
          id,
          value,
          configuration.key,
          configuration.label,
          configuration.type.name
        from CustomAttributeValue 
        where entity_id="${versionId}"
      `),
      {
        operation: 'fetch version custom attributes',
        entity: 'CustomAttributeValue',
        additionalData: { versionId, contextDisplay }
      }
    );

    if (customAttributeLinksResponse?.data && customAttributeLinksResponse.data.length > 0) {
      console.log("\n🏷️ Custom Attributes:");
      customAttributeLinksResponse.data.forEach((attr: any) => {
        console.log(`   • ${attr.configuration?.label || attr.configuration?.key || "Unknown"}: ${attr.value || "No value"}`);
        console.log(`     Type: ${attr.configuration?.type?.name || "Unknown type"}`);
        console.log(`     ID: ${attr.id}`);
        console.log("");
      });
    } else {
      console.log("\n🏷️ No custom attributes found");
    }

    // Fetch linked notes using direct session query (notes don't need project scoping)
    const linkedNotesResponse = await withErrorHandling(
      () => session.query(`
        select 
          id,
          content,
          user.first_name,
          user.last_name,
          user.username,
          date,
          category.name
        from Note 
        where parent_id="${versionId}"
        order by date desc
        limit 10
      `),
      {
        operation: 'fetch version notes',
        entity: 'Note',
        additionalData: { versionId, contextDisplay }
      }
    );

    if (linkedNotesResponse?.data && linkedNotesResponse.data.length > 0) {
      console.log("\n📝 Linked Notes (last 10):");
      linkedNotesResponse.data.forEach((note: any) => {
        const user = note.user ? `${note.user.first_name} ${note.user.last_name} (${note.user.username})` : "Unknown user";
        const date = note.date ? new Date(note.date).toLocaleString() : "Unknown date";
        
        console.log(`   • ${note.category?.name || "General"} - ${user}`);
        console.log(`     Date: ${date}`);
        console.log(`     Content: ${note.content || "No content"}`);
        console.log(`     ID: ${note.id}`);
        console.log("");
      });
    } else {
      console.log("\n📝 No linked notes found");
    }

    debug(`Version inspection completed for ID: ${versionId}`);
  } catch (error) {
    handleError(error, {
      operation: 'inspect version',
      entity: 'AssetVersion',
      additionalData: { versionId, contextDisplay }
    });
    throw error;
  }
}
