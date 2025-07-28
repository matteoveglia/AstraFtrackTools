import type { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export async function inspectNote(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
  noteId?: string
): Promise<void> {
  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal 
    ? "all projects" 
    : `project "${projectContext.project?.name}"`;

  try {
    // Prompt for note ID if not provided
    if (!noteId) {
      const { inputNoteId } = await inquirer.prompt([
        {
          type: "input",
          name: "inputNoteId",
          message: "Enter the Note ID to inspect:",
          validate: (input) => {
            if (!input.trim()) {
              return "Note ID is required";
            }
            return true;
          },
        },
      ]);
      noteId = inputNoteId.trim();
    }

    console.log(`\n🔍 Inspecting Note: ${noteId} (${contextDisplay})`);

    // Fetch note details using direct session query (notes don't need project scoping)
    const noteResponse = await withErrorHandling(
      () => session.query(`
        select 
          id, 
          content, 
          author.first_name, 
          author.last_name,
          author.username,
          date,
          category.name,
          category.color,
          parent.name,
          parent.id
        from Note 
        where id="${noteId}"
      `),
      {
        operation: 'fetch note details',
        entity: 'Note',
        additionalData: { noteId, contextDisplay }
      }
    );

    if (!noteResponse?.data || noteResponse.data.length === 0) {
      console.log(`❌ Note with ID "${noteId}" not found`);
      return;
    }

    const note = noteResponse.data[0];

    // Display note information
    console.log("\n📝 Note Details:");
    console.log(`   ID: ${note.id}`);
    console.log(`   Content: ${note.content || "No content"}`);
    console.log(`   Author: ${note.author?.first_name} ${note.author?.last_name} (${note.author?.username})`);
    console.log(`   Date: ${note.date ? new Date(note.date).toLocaleString() : "Unknown"}`);
    console.log(`   Category: ${note.category?.name || "No category"} ${note.category?.color ? `(${note.category.color})` : ""}`);
    console.log(`   Parent: ${note.parent?.name || "No parent"} ${note.parent?.id ? `(${note.parent.id})` : ""}`);

    // Fetch note components using direct session query
    const componentsResponse = await withErrorHandling(
      () => session.query(`
        select 
          id,
          name,
          file_type,
          size
        from Component 
        where note_id="${noteId}"
      `),
      {
        operation: 'fetch note components',
        entity: 'Component',
        additionalData: { noteId, contextDisplay }
      }
    );

    if (componentsResponse?.data && componentsResponse.data.length > 0) {
      console.log("\n📎 Attachments:");
      componentsResponse.data.forEach((component: any) => {
        console.log(`   • ${component.name} (${component.file_type || "unknown type"}, ${component.size ? `${component.size} bytes` : "unknown size"})`);
      });
    } else {
      console.log("\n📎 No attachments found");
    }

    // Fetch component locations using direct session query
    const locationsResponse = await withErrorHandling(
      () => session.query(`
        select 
          component.name,
          location.name,
          resource_identifier
        from ComponentLocation 
        where component.note_id="${noteId}"
      `),
      {
        operation: 'fetch component locations',
        entity: 'ComponentLocation',
        additionalData: { noteId, contextDisplay }
      }
    );

    if (locationsResponse?.data && locationsResponse.data.length > 0) {
      console.log("\n📍 Component Locations:");
      locationsResponse.data.forEach((location: any) => {
        console.log(`   • ${location.component?.name}: ${location.location?.name} - ${location.resource_identifier}`);
      });
    }

    // Fetch metadata using direct session query
    const metadataResponse = await withErrorHandling(
      () => session.query(`
        select 
          key,
          value
        from Metadata 
        where parent_id="${noteId}"
      `),
      {
        operation: 'fetch note metadata',
        entity: 'Metadata',
        additionalData: { noteId, contextDisplay }
      }
    );

    if (metadataResponse?.data && metadataResponse.data.length > 0) {
      console.log("\n🏷️  Metadata:");
      metadataResponse.data.forEach((meta: any) => {
        console.log(`   ${meta.key}: ${meta.value}`);
      });
    } else {
      console.log("\n🏷️  No metadata found");
    }

    debug(`Note inspection completed for ID: ${noteId}`);
  } catch (error) {
    handleError(error, {
      operation: 'inspect note',
      entity: 'Note',
      additionalData: { noteId, contextDisplay }
    });
    throw error;
  }
}