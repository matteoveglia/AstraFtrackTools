/**
 * Updates shots' latest delivered version links and sent dates.
 *
 * This tool provides two main modes:
 * 1. Check for new changes only (default)
 *    - Only updates shots where a newer delivered version exists
 *    - Updates both the version link and the sent date
 *
 * 2. Force update mode
 *    - Can update all shots regardless of current state
 *    - Option to switch to only detected differences after preview
 *    - Useful for fixing inconsistencies or updating dates
 *
 * The tool will:
 * 1. Get all shots and their current version links
 * 2. Find the latest delivered version for each shot
 * 3. Show a preview of all proposed changes
 * 4. Allow batch or individual update confirmation
 *
 * Note: Only considers published and delivered versions
 */

import type { Session } from "@ftrack/api";
import { Confirm, Select } from "@cliffy/prompt";
import chalk from "chalk";
import type {
	AssetVersion,
	ContextCustomAttributeValue,
	Shot,
} from "../schemas/schema.ts";
import { isDeliveredAttribute } from "../types/index.ts";
import { debug } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";

interface ProposedChange {
	shotName: string;
	shotId: string;
	currentVersion: string;
	newVersion: string;
	versionId: string;
	date: string;
	parentName: string;
	currentLinkId?: string;
	dateSent: string | null;
	dateAttributeConfig?: {
		configuration_id: string;
		key: string;
		entity_id: string;
	};
	reason: "new_version" | "force_update";
	currentDate: string | null;
	newDate: string | null;
}

interface LinkMap {
	[shotId: string]: {
		linkId: string;
		versionId: string;
	};
}

interface DateMap {
	[shotId: string]: string;
}

// Helper function to reliably detect interactive TTY environments (works better than Deno.stdin.isTerminal in tests)
function isInteractive(): boolean {
	return (
		typeof Deno !== "undefined" &&
		typeof (Deno as unknown as { isatty?: (rid: number) => boolean }).isatty ===
			"function" &&
		(Deno as unknown as { isatty: (rid: number) => boolean }).isatty(
			(Deno.stdin as unknown as { rid: number }).rid,
		)
	);
}

// Helper function for date formatting
function formatDate(dateString: string | null): string {
	if (!dateString) return "Not set";
	return new Date(dateString).toISOString().split("T")[0];
}

function isDateSentAttribute(
	attr: ContextCustomAttributeValue,
): attr is ContextCustomAttributeValue & {
	key: "dateSent";
	value: string;
} {
	return attr?.key === "dateSent";
}

export async function updateLatestVersionsSent(
	session: Session,
	projectContextService: ProjectContextService,
	queryService: QueryService,
): Promise<void> {
	try {
		debug("Starting updateLatestVersionsSent process");

		const projectContext = projectContextService.getContext();
		const contextInfo = projectContext.isGlobal
			? "all projects (site-wide)"
			: `project "${projectContext.project?.name}"`;

		console.log(chalk.blue(`\nUpdating latest versions for: ${contextInfo}\n`));

		let mode: "new" | "force" = "new";
		// Skip interactive prompt in non-interactive environments (e.g., automated tests)
		if (isInteractive()) {
			mode = (await Select.prompt({
				message: "Select update mode:",
				options: [
					{ name: "Check for new changes only", value: "new" },
					{ name: "Force update all shots", value: "force" },
				],
				default: "new",
			})) as "new" | "force";
		}

		const forceUpdate = mode === "force";
		debug(`Update mode: ${forceUpdate ? "Force update" : "New changes only"}`);

		console.log("Loading configurations... ⏳");

		// Get both custom attribute configurations
		const configResponse = await session.query(`
      select id, key
      from CustomAttributeLinkConfiguration
      where key is "latestVersionSent"
      and entity_type is "task"
    `);

		const dateConfigResponse = await session.query(`
      select id, key
      from CustomAttributeConfiguration
      where key is "latestVersionSentDate"
      and object_type_id in (select id from ObjectType where name is "Shot")
    `);

		// ... existing code ...
		if (!configResponse.data?.length || !dateConfigResponse.data?.length) {
			console.log("❌ Failed to load configurations");
			throw new Error("Could not find necessary configurations");
		}

		const configId = configResponse.data[0].id;
		const dateConfigId = dateConfigResponse.data[0].id;
		debug(`Found configuration ID: ${configId}`);
		debug(`Found date configuration ID: ${dateConfigId}`);

		console.log("\r✅ Configurations loaded");
		console.log("Loading project data... ⏳");

		// Use QueryService to get project-scoped shots
		const shotsResponse = await queryService.queryShots();
		const shots = shotsResponse.data as Shot[];

		// Build project-scoped queries for other data
		const versionQuery = projectContextService.buildProjectScopedQuery(`
      select 
        id, version, asset.name, asset.parent.id,
        date, custom_attributes, is_published, task.parent.id
      from AssetVersion
      where custom_attributes any (key is "dateSent")
    `);

		const linksQuery = projectContextService.buildProjectScopedQuery(`
      select id, from_id, to_id
      from CustomAttributeLink
      where configuration.key is "latestVersionSent"
    `);

		const datesQuery = projectContextService.buildProjectScopedQuery(`
      select entity_id, value
      from ContextCustomAttributeValue
      where configuration_id is "${dateConfigId}"
    `);

		// Fetch all necessary data in bulk with project scoping
		const [versionsResponse, linksResponse, datesResponse] = await Promise.all([
			session.query(versionQuery),
			session.query(linksQuery),
			session.query(datesQuery),
		]);

		console.log("\r✅ Project data loaded");
		console.log("Processing shots... ⏳\n");

		// Create lookup maps
		const linkMap: LinkMap = {};
		// Filter links to only include those for shots in the current project
		const shotIds = new Set(shots.map((shot) => shot.id));
		linksResponse.data.forEach((link) => {
			// Only include links for shots in the current project
			if (shotIds.has(link.from_id)) {
				linkMap[link.from_id] = {
					linkId: link.id,
					versionId: link.to_id,
				};
			}
		});

		const dateMap: DateMap = {};
		// Filter dates to only include those for shots in the current project
		datesResponse.data.forEach((date) => {
			// Only include dates for shots in the current project
			if (shotIds.has(date.entity_id)) {
				dateMap[date.entity_id] = date.value;
			}
		});

		debug(`Found ${shotsResponse.data.length} shots to process`);

		// Sort shots alphabetically for consistent processing order
		shots.sort((a, b) => a.name.localeCompare(b.name));

		// Process each shot
		const proposedChanges: ProposedChange[] = [];
		const noDeliveredVersions: Array<{ name: string; parent: string }> = [];
		const totalShots = shots.length;
		let processedCount = 0;

		for (const shot of shots) {
			processedCount++;
			const progress = `${processedCount.toString().padStart(3, "0")}/${totalShots
				.toString()
				.padStart(3, "0")}`;

			console.log(`[${progress}] Processing shot: ${shot.name}`);
			debug(`Processing shot: ${shot.name} (${shot.id})`);

			// Use map lookups
			const currentLink = linkMap[shot.id];
			const currentDate = dateMap[shot.id];

			// Get all versions for this shot (through task or asset parent)
			const shotVersions = (versionsResponse.data as AssetVersion[]).filter(
				(version) =>
					version.task?.parent?.id === shot.id ||
					version.asset?.parent?.id === shot.id,
			);

			// Filter for delivered versions
			const deliveredVersions = shotVersions.filter((version) => {
				if (!version.custom_attributes) return false;
				const deliveredAttr = (
					version.custom_attributes as ContextCustomAttributeValue[]
				).find(isDeliveredAttribute);
				return version.is_published && deliveredAttr?.value === true;
			});

			debug(
				`Found ${deliveredVersions.length} delivered versions for ${shot.name}`,
			);

			// Sort by dateSent first, then by version number if dates are equal
			const sortedVersions = deliveredVersions.sort((a, b) => {
				const aAttr = (
					a.custom_attributes as ContextCustomAttributeValue[]
				).find(isDateSentAttribute);
				const bAttr = (
					b.custom_attributes as ContextCustomAttributeValue[]
				).find(isDateSentAttribute);

				const aDate = aAttr?.value || "";
				const bDate = bAttr?.value || "";

				// Compare dates first
				const dateComparison =
					new Date(bDate).getTime() - new Date(aDate).getTime();

				// If dates are equal, compare version numbers
				if (dateComparison === 0) {
					return (b.version || 0) - (a.version || 0);
				}

				return dateComparison;
			});

			if (sortedVersions.length > 0) {
				const latestVersion = sortedVersions[0];

				// Get the date from the version's custom attributes
				const dateSentAttr = (
					latestVersion.custom_attributes as ContextCustomAttributeValue[]
				).find(isDateSentAttribute);
				const dateSent = dateSentAttr?.value || null;

				// Get current version details
				let currentVersionName = "None";
				if (currentLink) {
					const currentVersion = deliveredVersions.find(
						(v) => v.id === currentLink.versionId,
					);
					if (currentVersion?.asset?.name && currentVersion.version) {
						currentVersionName = `${currentVersion.asset.name}_v${currentVersion.version
							.toString()
							.padStart(3, "0")}`;
					}
				}

				if (latestVersion.asset?.name && latestVersion.version) {
					const newVersionName = `${latestVersion.asset.name}_v${latestVersion.version
						.toString()
						.padStart(3, "0")}`;
					if (forceUpdate || currentLink?.versionId !== latestVersion.id) {
						debug(
							`${
								forceUpdate ? "Force updating" : "Found newer version for"
							} ${shot.name}: ${newVersionName}`,
						);
						proposedChanges.push({
							shotName: shot.name,
							shotId: shot.id,
							currentVersion: currentVersionName,
							newVersion: newVersionName,
							versionId: latestVersion.id,
							date: latestVersion.date
								? formatDate(latestVersion.date)
								: "No date",
							parentName: shot.parent?.name || "No Parent",
							currentLinkId: currentLink?.linkId,
							dateSent,
							dateAttributeConfig: {
								configuration_id: dateConfigId,
								key: "latestVersionSentDate",
								entity_id: shot.id,
							},
							reason: forceUpdate ? "force_update" : "new_version",
							currentDate,
							newDate: dateSent,
						});
					}
				}
			} else {
				noDeliveredVersions.push({
					name: shot.name,
					parent: shot.parent?.name || "No Parent",
				});
			}
		}

		// Sort and log shots with no delivered versions
		if (noDeliveredVersions.length > 0) {
			noDeliveredVersions.sort((a, b) => a.name.localeCompare(b.name));

			// Get unique parents, sort them
			const uniqueParents = [
				...new Set(noDeliveredVersions.map((shot) => shot.parent)),
			].sort((a, b) => a.localeCompare(b));

			console.log(
				`\nNo delivered versions found for the following ${chalk.yellow(
					noDeliveredVersions.length,
				)} shots:`,
			);
			console.log(`Parents: ${uniqueParents.join(", ")}`);
			console.log(noDeliveredVersions.map((shot) => shot.name).join(", "));
		}

		// Sort proposed changes by shot name
		proposedChanges.sort((a, b) => a.shotName.localeCompare(b.shotName));

		// Store all changes if in force mode for potential filtering
		const changesPool = [...proposedChanges];

		// Enhanced preview with colored diffs
		console.log("\nProposed Changes:");
		console.log("=================");

		// Show changes summary
		proposedChanges.forEach((change) => {
			console.log(`\n${chalk.bold(change.shotName)} (${change.parentName})`);

			// Version diff
			const versionDiff = change.currentVersion !== change.newVersion;
			console.log("Version:");
			console.log(
				`  From: ${
					versionDiff ? chalk.red(change.currentVersion) : change.currentVersion
				}`,
			);
			console.log(
				`  To:   ${
					versionDiff ? chalk.green(change.newVersion) : change.newVersion
				}`,
			);

			// Date diff with formatted dates - compare formatted dates
			const formattedCurrentDate = formatDate(change.currentDate);
			const formattedNewDate = formatDate(change.newDate);
			const dateDiff = formattedCurrentDate !== formattedNewDate;
			console.log("Date:");
			console.log(
				`  From: ${
					dateDiff ? chalk.red(formattedCurrentDate) : formattedCurrentDate
				}`,
			);
			console.log(
				`  To:   ${
					dateDiff ? chalk.green(formattedNewDate) : formattedNewDate
				}`,
			);

			console.log(
				`Reason: ${chalk.blue(
					change.reason === "force_update"
						? "Force update"
						: "New version available",
				)}`,
			);
		});

		// If in force mode, offer option to switch to only differences
		if (forceUpdate && proposedChanges.length > 0) {
			const switchMode = await Select.prompt({
				message: "You are in force update mode. How would you like to proceed?",
				options: [
					{ name: "Continue with all updates", value: "continue" },
					{ name: "Filter to changes only", value: "differences" },
				],
			});

			if (switchMode === "differences") {
				// Filter to keep only changes where version or date is different
				proposedChanges.length = 0; // Clear array keeping reference
				const filteredChanges = changesPool.filter((change) => {
					const versionDiff = change.currentVersion !== change.newVersion;
					const dateDiff =
						formatDate(change.currentDate) !== formatDate(change.newDate);
					return versionDiff || dateDiff;
				});
				proposedChanges.push(...filteredChanges);

				// Show updated summary
				console.log("\nUpdated Changes (Differences Only):");
				console.log("==================================");
				proposedChanges.forEach((change) => {
					console.log(
						`\n${chalk.bold(change.shotName)} (${change.parentName})`,
					);

					// Version diff
					const versionDiff = change.currentVersion !== change.newVersion;
					console.log("Version:");
					console.log(
						`  From: ${
							versionDiff
								? chalk.red(change.currentVersion)
								: change.currentVersion
						}`,
					);
					console.log(
						`  To:   ${
							versionDiff ? chalk.green(change.newVersion) : change.newVersion
						}`,
					);

					// Date diff with formatted dates - compare formatted dates
					const formattedCurrentDate = formatDate(change.currentDate);
					const formattedNewDate = formatDate(change.newDate);
					const dateDiff = formattedCurrentDate !== formattedNewDate;
					console.log("Date:");
					console.log(
						`  From: ${
							dateDiff ? chalk.red(formattedCurrentDate) : formattedCurrentDate
						}`,
					);
					console.log(
						`  To:   ${
							dateDiff ? chalk.green(formattedNewDate) : formattedNewDate
						}`,
					);

					console.log(
						`Reason: ${chalk.blue(
							change.reason === "force_update"
								? "Force update"
								: "New version available",
						)}`,
					);
				});
			}
		}

		// Replace confirm prompt with Cliffy
		let action = "cancel";
		if (isInteractive()) {
			action = await Select.prompt({
				message: `How would you like to proceed with these ${proposedChanges.length} changes?`,
				options: [
					{ name: "Apply all changes", value: "all" },
					{ name: "Review one by one", value: "review" },
					{ name: "Cancel", value: "cancel" },
				],
			});
		}

		if (action === "cancel") {
			console.log("Update cancelled.");
			return;
		}

		if (action === "all") {
			console.log("Applying updates... ⏳");

			// Perform all updates at once
			for await (const change of proposedChanges) {
				try {
					debug(`Processing update for ${change.shotName}`);
					debug(`Shot ID: ${change.shotId}`);
					debug(`Version ID: ${change.versionId}`);
					debug(`Config ID: ${configId}`);

					if (change.currentLinkId) {
						debug(`Updating existing link: ${change.currentLinkId}`);
						await session.update(
							"CustomAttributeLink",
							[change.currentLinkId],
							{
								to_id: change.versionId,
							},
						);
					} else {
						debug("Creating new link");
						const linkData = {
							configuration_id: configId,
							from_id: change.shotId,
							to_id: change.versionId,
							to_entity_type: "AssetVersion",
						};
						debug(`Link data: ${JSON.stringify(linkData, null, 2)}`);

						const operation = {
							action: "create",
							entity_type: "CustomAttributeLink",
							entity_data: linkData,
						};

						debug("Sending direct operation");
						await session.call([operation]);
					}

					// Update date if available
					if (change.dateSent && change.dateAttributeConfig) {
						await session.update(
							"ContextCustomAttributeValue",
							[
								change.dateAttributeConfig.configuration_id,
								change.dateAttributeConfig.entity_id,
							],
							{
								value: change.dateSent,
								key: change.dateAttributeConfig.key,
								entity_id: change.dateAttributeConfig.entity_id,
								configuration_id: change.dateAttributeConfig.configuration_id,
							},
						);
					}

					console.log(
						`Updated ${change.shotName}: ${change.currentVersion} → ${change.newVersion} (Date: ${
							change.dateSent || "Not set"
						})`,
					);
				} catch (error) {
					console.error(`Failed to update shot ${change.shotName}:`, error);
				}
			}
			console.log(
				`\n✅ All updates completed successfully! Processed ${totalShots} shots, updated ${proposedChanges.length} shots.`,
			);
		} else if (action === "review") {
			// Replace individual prompts with Cliffy
			for (const change of proposedChanges) {
				let confirm = "no";
				if (isInteractive()) {
					confirm = await Select.prompt({
						message: `
Update ${chalk.bold(change.shotName)} (${change.parentName})?
Version: ${chalk.red(change.currentVersion)} → ${chalk.green(change.newVersion)}
Date: ${chalk.red(formatDate(change.currentDate))} → ${chalk.green(
							formatDate(change.newDate),
						)}
          `,
						options: [
							{ name: "Yes", value: "yes" },
							{ name: "No", value: "no" },
							{ name: "Quit", value: "quit" },
						],
					});
				}

				if (confirm === "quit") {
					console.log("Updates stopped by user.");
					break;
				}

				if (confirm === "yes") {
					console.log(`Updating ${change.shotName}... ⏳`);

					try {
						debug(`Processing individual update for ${change.shotName}`);
						debug(`Shot ID: ${change.shotId}`);
						debug(`Version ID: ${change.versionId}`);
						debug(`Config ID: ${configId}`);

						if (change.currentLinkId) {
							debug(`Updating existing link: ${change.currentLinkId}`);
							await session.update(
								"CustomAttributeLink",
								[change.currentLinkId],
								{
									to_id: change.versionId,
								},
							);
						} else {
							debug("Creating new link");
							const linkData = {
								configuration_id: configId,
								from_id: change.shotId,
								to_id: change.versionId,
								to_entity_type: "AssetVersion",
							};
							debug(`Link data: ${JSON.stringify(linkData, null, 2)}`);

							const operation = {
								action: "create",
								entity_type: "CustomAttributeLink",
								entity_data: linkData,
							};

							debug("Sending direct operation");
							await session.call([operation]);
						}

						// Update date if available
						if (change.dateSent && change.dateAttributeConfig) {
							await session.update(
								"ContextCustomAttributeValue",
								[
									change.dateAttributeConfig.configuration_id,
									change.dateAttributeConfig.entity_id,
								],
								{
									value: change.dateSent,
									key: change.dateAttributeConfig.key,
									entity_id: change.dateAttributeConfig.entity_id,
									configuration_id: change.dateAttributeConfig.configuration_id,
								},
							);
						}

						console.log(
							`\r✅ Updated ${change.shotName}: ${change.currentVersion} → ${change.newVersion} (Date: ${
								change.dateSent || "Not set"
							})`,
						);
					} catch (error) {
						console.log(`\r❌ Failed to update ${change.shotName}`);
						console.error(`Failed to update shot ${change.shotName}:`, error);
						const continueAfterError = await Confirm.prompt({
							message: "Continue with remaining updates?",
							default: true,
						});

						if (!continueAfterError) {
							break;
						}
					}
				} else {
					debug(`Skipped update for ${change.shotName}`);
					console.log(`Skipped ${change.shotName}`);
				}
			}
			console.log(
				`\n✅ Finished processing all selected updates. Processed ${totalShots} shots total.`,
			);
		}
	} catch (error) {
		console.error("Error during processing:", error);
		throw error;
	}
}
