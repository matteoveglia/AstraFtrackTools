import { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";

export async function inspectNote(session: Session, noteId?: string) {
  // If no noteId provided, prompt user for input
  if (!noteId) {
    debug("No note ID provided, prompting user for input");
    const answer = await inquirer.prompt({
      type: "input",
      name: "noteId",
      message: "Enter Note ID:",
      validate: (input: string) => {
        return input.length > 0 || "Please enter a valid ID";
      },
    });
    noteId = answer.noteId;
  }

  debug(`Inspecting note with ID: ${noteId}`);

  try {
    // Get note details
    const noteData = await session.query(`
      select 
        id,
        content,
        parent_id,
        parent_type,
        date,
        author.id,
        author.first_name,
        author.last_name
      from Note 
      where id="${noteId}"
    `);

    if (noteData.data.length === 0) {
      console.error(`Note ${noteId} not found!`);
      return;
    }

    const note = noteData.data[0];
    console.log("\n=== NOTE DETAILS ===");
    console.log(JSON.stringify(note, null, 2));

    // Get note components
    const noteComponents = await session.query(`
      select 
        component_id,
        component.name,
        component.file_type,
        component.size
      from NoteComponent 
      where note_id="${noteId}"
    `);

    if (noteComponents.data.length === 0) {
      console.log("\nNote has no attachments");
      return;
    }

    console.log("\n=== NOTE ATTACHMENTS ===");
    console.log(JSON.stringify(noteComponents.data, null, 2));

    // Get component locations and metadata
    for (const component of noteComponents.data) {
      debug(`Inspecting component: ${component.component_id}`);
      
      const locations = await session.query(`
        select 
          location_id,
          location.name,
          resource_identifier
        from ComponentLocation 
        where component_id="${component.component_id}"
      `);

      const metadata = await session.query(`
        select 
          key,
          value
        from Metadata 
        where parent_id="${component.component_id}"
      `);

      console.log(`\n=== COMPONENT ${component.component_id} DETAILS ===`);
      console.log("Locations:");
      console.log(JSON.stringify(locations.data, null, 2));
      console.log("\nMetadata:");
      console.log(JSON.stringify(metadata.data, null, 2));
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error occurred";
    console.error("Error while inspecting note:", errorMessage);
    throw error;
  }
} 