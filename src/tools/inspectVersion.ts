import type { Session } from "@ftrack/api";
import { Input } from "@cliffy/prompt";
import { debug } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export async function inspectVersion(
	session: Session,
	projectContextService: ProjectContextService,
	queryService: QueryService,
	versionId?: string,
): Promise<void> {
	const projectContext = projectContextService.getContext();
	const contextDisplay = projectContext.isGlobal
		? "all projects"
		: `project "${projectContext.project?.name}"`;

	try {
		// Prompt for version ID if not provided
		if (!versionId) {
			versionId = await Input.prompt({
				message: "Enter the Version ID to inspect:",
				validate: (input: string) => {
					if (!input.trim()) {
						return "Version ID is required";
					}
					return true;
				},
			});
			versionId = versionId.trim();
		}

		console.log(`\n🔍 Inspecting Version: ${versionId} (${contextDisplay})`);

		// Fetch version details using QueryService
		const versionResponse = await withErrorHandling(
			() => queryService.queryAssetVersions(`id is "${versionId}"`),
			{
				operation: "fetch version details",
				entity: "Version",
				additionalData: { versionId, contextDisplay },
			},
		);

		if (!versionResponse?.data || versionResponse.data.length === 0) {
			console.log(`❌ Version with ID "${versionId}" not found`);
			return;
		}

		const version = versionResponse.data[0];
		const versionData = version as {
			id: string;
			asset?: { name?: string };
			version?: number;
			status?: { name?: string };
			task?: { name?: string };
			user?: { first_name?: string; last_name?: string; username?: string };
			date?: string;
			comment?: string;
		};

		// Display version information
		console.log("\n📦 Version Details:");
		console.log(`   ID: ${versionData.id}`);
		console.log(`   Asset: ${versionData.asset?.name || "Unknown asset"}`);
		console.log(`   Version: ${versionData.version || "Unknown"}`);
		console.log(`   Status: ${versionData.status?.name || "No status"}`);
		console.log(`   Task: ${versionData.task?.name || "No task"}`);
		console.log(
			`   User: ${versionData.user?.first_name} ${versionData.user?.last_name} (${versionData.user?.username})`,
		);
		console.log(
			`   Date: ${
				versionData.date
					? new Date(versionData.date).toLocaleString()
					: "Unknown"
			}`,
		);
		console.log(`   Comment: ${versionData.comment || "No comment"}`);

		// Fetch custom attribute links using direct session query (custom attributes don't need project scoping)
		const customAttributeLinksResponse = await withErrorHandling(
			() =>
				session.query(`
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
				operation: "fetch version custom attributes",
				entity: "CustomAttributeValue",
				additionalData: { versionId, contextDisplay },
			},
		);

		if (
			customAttributeLinksResponse?.data &&
			customAttributeLinksResponse.data.length > 0
		) {
			console.log("\n🏷️ Custom Attributes:");
			customAttributeLinksResponse.data.forEach((attr: unknown) => {
				const attrData = attr as {
					id: string;
					value?: string;
					configuration?: {
						key?: string;
						label?: string;
						type?: { name?: string };
					};
				};
				console.log(
					`   • ${
						attrData.configuration?.label ||
						attrData.configuration?.key ||
						"Unknown"
					}: ${attrData.value || "No value"}`,
				);
				console.log(
					`     Type: ${attrData.configuration?.type?.name || "Unknown type"}`,
				);
				console.log(`     ID: ${attrData.id}`);
				console.log("");
			});
		} else {
			console.log("\n🏷️ No custom attributes found");
		}

		// Fetch linked notes using direct session query (notes don't need project scoping)
		const linkedNotesResponse = await withErrorHandling(
			() =>
				session.query(`
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
				operation: "fetch version notes",
				entity: "Note",
				additionalData: { versionId, contextDisplay },
			},
		);

		if (linkedNotesResponse?.data && linkedNotesResponse.data.length > 0) {
			console.log("\n📝 Linked Notes (last 10):");
			linkedNotesResponse.data.forEach((note: unknown) => {
				const noteData = note as {
					id: string;
					content?: string;
					user?: { first_name?: string; last_name?: string; username?: string };
					date?: string;
					category?: { name?: string };
				};
				const user = noteData.user
					? `${noteData.user.first_name} ${noteData.user.last_name} (${noteData.user.username})`
					: "Unknown user";
				const date = noteData.date
					? new Date(noteData.date).toLocaleString()
					: "Unknown date";

				console.log(`   • ${noteData.category?.name || "General"} - ${user}`);
				console.log(`     Date: ${date}`);
				console.log(`     Content: ${noteData.content || "No content"}`);
				console.log(`     ID: ${noteData.id}`);
				console.log("");
			});
		} else {
			console.log("\n📝 No linked notes found");
		}

		debug(`Version inspection completed for ID: ${versionId}`);
	} catch (error) {
		handleError(error, {
			operation: "inspect version",
			entity: "Version",
			additionalData: { versionId, contextDisplay },
		});
		throw error;
	}
}
