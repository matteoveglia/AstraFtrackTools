import type { Session } from "@ftrack/api";
import { Select, Confirm, Input, Checkbox } from "@cliffy/prompt";
import chalk from "chalk";
import { debug } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import { DeletionService } from "../services/deletionService.ts";
import type { DeleteMode, DryRunReportItem, DeletionResultSummary, ComponentDeletionChoice } from "../types/deleteMedia.ts";
import { SessionService } from "../services/session.ts";
import { getDownloadsDirectory, verifyDirectoryAccess } from "../utils/systemPaths.ts";

/**
 * Delete Media Tool (scaffold)
 * Currently provides a dry-run-only placeholder flow.
 */
export async function deleteMediaTool(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
): Promise<void> {
  debug("Starting Delete Media Tool (scaffold)");

  // Enforce project-scoped only
  console.log(chalk.blue("\nDelete Media Tool (Preview Mode)"));
  console.log(chalk.yellow("This is a scaffolded preview. No deletions will be performed."));

  const mode = (await Select.prompt({
    message: "Select deletion mode",
    options: [
      { name: "Delete whole asset versions", value: "versions" },
      { name: "Delete components only (original/encoded)", value: "components" },
      { name: "Age-based cleanup", value: "age" },
      { name: "Filter-based deletion", value: "filter" },
    ],
  })) as DeleteMode;

  const sessionService = new SessionService(session);
  const deletionService = new DeletionService(session, sessionService, queryService);

  if (mode === "versions") {
    const idsRaw = await Input.prompt({
      message: "Enter AssetVersion IDs to preview delete (comma-separated)",
      default: "",
    });
    const versionIds = idsRaw.split(/[\,\s\u001f]+/).map((s) => s.trim()).filter(Boolean);

    if (versionIds.length === 0) {
      console.log(chalk.yellow("No IDs provided. Aborting."));
      return;
    }

    const { report, summary } = await deletionService.deleteAssetVersions(versionIds, { dryRun: true });

    console.log(chalk.green(`\nPreview generated for ${versionIds.length} AssetVersion ID(s).`));

    // Export dry-run details to Downloads directory
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);

    if (!canWrite) {
      console.log(chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`));
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath = `${downloadsDir}/delete-media-preview-${timestamp}.csv`;

      try {
        const mergedCsv = formatMergedCSV(summary, report);
        await Deno.writeTextFile(mergedPath, mergedCsv);
        console.log(chalk.green("\n📝 Dry-run export created:"));
        console.log(` - Merged: ${mergedPath}`);
      } catch (err) {
        debug(`Failed to write dry-run export: ${err}`);
        console.log(chalk.red("Failed to write dry-run export file."));
      }
    }

    // Display quick console summary
    console.log(`\nSummary:`);
    console.log(` - Versions: ${summary.versionsDeleted}`);
    console.log(` - Components: ${summary.componentsDeleted}`);
    console.log(` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`);

    // Typed confirmation gating sample (per decisions)
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({ message: `Type "DELETE NOW" to confirm preview completion`, default: "" });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({ message: "Proceed to actual deletion flow (not implemented)?", default: false });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    console.log(chalk.yellow("Note: Actual deletion not implemented in scaffold."));
    return;
  }

  if (mode === "components") {
    // Choose input method
    const inputMethod = await Select.prompt({
      message: "How would you like to specify asset versions?",
      options: [
        { name: "Enter AssetVersion IDs directly", value: "ids" },
        { name: "Search by shot name(s)", value: "shots" },
      ],
    });

    let versionIds: string[] = [];

    if (inputMethod === "ids") {
      const idsRaw = await Input.prompt({
        message: "Enter AssetVersion IDs to preview component delete (comma-separated)",
        default: "",
      });
      versionIds = idsRaw.split(/[\,\s\u001f]+/).map((s) => s.trim()).filter(Boolean);
    } else {
      // Search by shot names
      const shotNamesRaw = await Input.prompt({
        message: "Enter shot name(s) to find asset versions (comma-separated). Tip: use wildcard * (e.g., SHOT02*)",
        default: "",
      });
      const shotNames = shotNamesRaw.split(/[\,\s\u001f]+/).map((s) => s.trim()).filter(Boolean);

      if (shotNames.length === 0) {
        console.log(chalk.yellow("No shot names provided. Aborting."));
        return;
      }

      // Search for asset versions in specified shots
      console.log(chalk.blue("Searching for asset versions in specified shots..."));
      
      // Build query with wildcard support
      const shotFilters = shotNames.map(name => {
        if (name.includes('*')) {
          // Translate '*' to SQL LIKE '%' for Ftrack query
          const pattern = name.replaceAll('*', '%');
          return `asset.parent.name like "${pattern}"`;
        }
        // Exact match
        return `asset.parent.name is "${name}"`;
      });
      
      const shotFilter = shotFilters.join(" or ");
      const result = await queryService.queryAssetVersions(shotFilter);
      
      if (!result.data || result.data.length === 0) {
        console.log(chalk.yellow(`No asset versions found in shots: ${shotNames.join(", ")}`));
        return;
      }

      // Display found versions and let user select
      const versionOptions = (result.data as any[]).map((version: any) => {
        const shotName = version.asset?.parent?.name || "Unknown";
        const assetName = version.asset?.name || "Unknown";
        const versionNum = version.version || "?";
        return {
          name: `${shotName} - ${assetName} v${versionNum} - ${version.id}`,
          value: version.id,
        } as const;
      });

      const selectedVersions = await Checkbox.prompt({
        message: "Select asset versions to preview component delete:",
        options: [
          { name: "All found versions", value: "all" },
          ...versionOptions,
        ],
      }) as string[];

      if (selectedVersions.includes("all")) {
        versionIds = (result.data as any[]).map((v: any) => v.id);
      } else {
        versionIds = selectedVersions.filter(id => id !== "all");
      }
    }

    if (versionIds.length === 0) {
      console.log(chalk.yellow("No asset versions selected. Aborting."));
      return;
    }

    // Choose selection strategy
    const strategy = await Select.prompt({
      message: "Apply the same component choice to all IDs or choose per ID?",
      options: [
        { name: "Apply to all: All components", value: "all" },
        { name: "Apply to all: Only original", value: "original_only" },
        { name: "Apply to all: Only encoded", value: "encoded_only" },
        { name: "Choose per version ID", value: "per_version" },
      ],
    });

    const choiceMap = new Map<string, ComponentDeletionChoice>();

    if (strategy === "per_version") {
      // Prefetch display info for prompts in a single query
      const displayMap = new Map<string, string>();
      try {
        const filter = `id in (${versionIds.map((id) => `"${id}"`).join(", ")})`;
        const details = await queryService.queryAssetVersions(filter);
        for (const v of details.data as any[]) {
          const shotName = v.asset?.parent?.name || "Unknown";
          const assetName = v.asset?.name || "Unknown";
          const versionNum = v.version || "?";
          displayMap.set(v.id, `${shotName} - ${assetName} v${versionNum} - ${v.id}`);
        }
      } catch (_err) {
        // If this fails, we'll fall back to ID-only labels
      }

      for (const id of versionIds) {
        const label = displayMap.get(id) || `AssetVersion ${id}`;
        const choice = (await Select.prompt({
          message: `Choose components to delete for ${label}`,
          options: [
            { name: "All components", value: "all" },
            { name: "Only original", value: "original_only" },
            { name: "Only encoded", value: "encoded_only" },
          ],
        })) as ComponentDeletionChoice;
        choiceMap.set(id, choice);
      }
    } else {
      const globalChoice = strategy as ComponentDeletionChoice;
      for (const id of versionIds) choiceMap.set(id, globalChoice);
    }

    // Simple loading spinner
    function createSpinner(message: string) {
      const encoder = new TextEncoder();
      const frames = ["|", "/", "-", "\\"];
      let i = 0;
      const timer = setInterval(() => {
        const frame = frames[i = (i + 1) % frames.length];
        // \r carriage return to update same line
        Deno.stdout.write(encoder.encode(`\r${message} ${frame}`));
      }, 120);
      return {
        stop(finalMessage?: string) {
          clearInterval(timer);
          // Clear the line and optionally print a final message
          Deno.stdout.write(encoder.encode("\r"));
          if (finalMessage) {
            console.log(finalMessage);
          } else {
            console.log("");
          }
        }
      };
    }

    // Spinner during enumeration/generation
    const spinner = createSpinner("Generating preview...");
    let report: DryRunReportItem[] = [];
    let summary: DeletionResultSummary;
    try {
      const result = await deletionService.deleteComponents(choiceMap, { dryRun: true });
      report = result.report;
      summary = result.summary;
    } finally {
      spinner.stop();
    }

    console.log(chalk.green(`\nPreview generated for ${versionIds.length} AssetVersion ID(s).`));

    // Export dry-run details to Downloads directory
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);

    if (!canWrite) {
      console.log(chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`));
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath = `${downloadsDir}/delete-media-components-preview-${timestamp}.csv`;

      try {
        const mergedCsv = formatMergedCSV(summary, report);
        await Deno.writeTextFile(mergedPath, mergedCsv);
        console.log(chalk.green("\n📝 Dry-run export created:"));
        console.log(` - Merged: ${mergedPath}`);
      } catch (err) {
        debug(`Failed to write dry-run export: ${err}`);
        console.log(chalk.red("Failed to write dry-run export file."));
      }
    }

    // Display quick console summary
    console.log(`\nSummary:`);
    console.log(` - Versions: ${summary.versionsDeleted}`);
    console.log(` - Components: ${summary.componentsDeleted}`);
    console.log(` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`);

    // Typed confirmation gating sample (per decisions)
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({ message: `Type "DELETE NOW" to confirm preview completion`, default: "" });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({ message: "Proceed to actual deletion flow (not implemented)?", default: false });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    console.log(chalk.yellow("Note: Actual deletion not implemented in scaffold."));
    return;
  }

  console.log(chalk.yellow("Other modes not implemented in scaffold yet."));
}

function formatMergedCSV(summary: DeletionResultSummary, report: DryRunReportItem[]): string {
  const lines: string[] = [];
  // Summary section with human-readable headers and MB conversion
  lines.push("Summary");
  const summaryHeaders = [
    "Versions Deleted",
    "Components Deleted",
    "Deleted Size (MB)",
    "Failures"
  ];
  const deletedMB = (summary.bytesDeleted / (1024 * 1024)).toFixed(2);
  const summaryValues = [
    summary.versionsDeleted.toString(),
    summary.componentsDeleted.toString(),
    deletedMB,
    summary.failures.length.toString()
  ];
  lines.push(summaryHeaders.join(","));
  lines.push(summaryValues.join(","));

  if (summary.failures.length > 0) {
    lines.push("");
    lines.push("Failures");
    lines.push("ID,Reason");
    for (const f of summary.failures) {
      lines.push(`${f.id},${sanitizeCsv(f.reason)}`);
    }
  }

  // Separator
  lines.push("");
  lines.push("-----");
  lines.push("");
  lines.push("Details");

  // Details with human-readable headers and MB units
  const headers = [
    "Operation",
    "Asset Version ID",
    "Asset Version Label",
    "Shot Name",
    "Status",
    "User",
    "Component ID",
    "Component Name",
    "Component Type",
    "Size (MB)",
    "Locations",
  ];
  lines.push(headers.join(","));

  for (const item of report) {
    const sizeMB = item.size != null ? (item.size / (1024 * 1024)).toFixed(2) : "";
    const row = [
      item.operation || "",
      item.assetVersionId || "",
      sanitizeCsv(item.assetVersionLabel),
      sanitizeCsv(item.shotName),
      sanitizeCsv(item.status),
      sanitizeCsv(item.user),
      item.componentId || "",
      sanitizeCsv(item.componentName),
      sanitizeCsv(item.componentType),
      sizeMB,
      sanitizeCsv(item.locations?.join("; ")), // semicolon-separated list inside one CSV cell
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

function sanitizeCsv(value?: string): string {
  if (!value && value !== "") return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes("\"")) {
    return '"' + str.replace(/"/g, '""') + '"';
    }
  return str;
}