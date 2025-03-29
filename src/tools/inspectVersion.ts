import { Session } from "@ftrack/api";
import inquirer from "inquirer";
import { debug } from "../utils/debug.ts";

export async function inspectVersion(session: Session, versionId?: string) {
  // If no versionId provided, prompt user for input
  if (!versionId) {
    debug("No version ID provided, prompting user for input");
    const answer = await inquirer.prompt({
      type: "input",
      name: "versionId",
      message: "Enter AssetVersion ID:",
      validate: (input: string) => {
        return input.length > 0 || "Please enter a valid ID";
      },
    });
    versionId = answer.versionId;
  }

  debug(`Fetching version details for ID: ${versionId}`);

  // Get basic version info
  const response = await session.query(`
        select 
            id,
            version,
            asset.id,
            asset.name,
            task.id,
            task.name,
            task.parent.id,
            task.parent.name,
            task.parent.type.name,
            project.id,
            project.name,
            date,
            custom_attributes,
            is_published,
            asset.parent.id,
            asset.parent.name,
            asset.parent.type.name,
            metadata.key,
            metadata.value
        from AssetVersion 
        where id is "${versionId}"`);

  debug("Version details retrieved");

  // Get any custom attribute links
  debug("Fetching custom attribute links");
  const linksQuery = await session.query(`
        select 
            id, 
            configuration.key,
            configuration.id,
            from_id, 
            to_id, 
            from_entity_type,
            to_entity_type
        from CustomAttributeLink 
        where from_id is "${versionId}" 
        or to_id is "${versionId}"`);

  debug("Custom attribute links retrieved");

  // Get linked notes
  debug("Fetching linked notes");
  const notesQuery = await session.query(`
    select 
      id,
      content,
      date,
      author.id,
      author.first_name,
      author.last_name
    from Note
    where parent_id is "${versionId}"
  `);

  debug("Linked notes retrieved");

  console.log("\n=== VERSION DETAILS ===\n");
  console.log(JSON.stringify(response.data[0], null, 2));
  console.log("\n=== CUSTOM ATTRIBUTE LINKS ===\n");
  console.log(JSON.stringify(linksQuery.data, null, 2));
  console.log("\n=== LINKED NOTES ===\n");
  console.log(JSON.stringify(notesQuery.data, null, 2));
}
