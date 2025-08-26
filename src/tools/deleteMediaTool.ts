import type { Session } from "@ftrack/api";
import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import chalk from "chalk";
import { debug } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import { DeletionService } from "../services/deletionService.ts";
import type {
  ComponentDeletionChoice,
  DeleteMode,
  DeletionResultSummary,
  DryRunReportItem,
} from "../types/deleteMedia.ts";
import { SessionService } from "../services/session.ts";
import {
  getDownloadsDirectory,
  verifyDirectoryAccess,
} from "../utils/systemPaths.ts";
import { FilterService } from "../services/filterService.ts";
import { ListService } from "../services/listService.ts";
import { AdvancedSelectionService } from "../services/advancedSelectionService.ts";

// Simple loading spinner (shared)
// Simple loading spinner with enhanced progress tracking
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
    },
  };
}

// Enhanced progress spinner with percentage and ETA
// function createProgressSpinner(baseMessage: string) {
//   const encoder = new TextEncoder();
//   const frames = ["|", "/", "-", "\\"];
//   let i = 0;
//   let currentMessage = baseMessage;
//
//   const timer = setInterval(() => {
//     const frame = frames[i = (i + 1) % frames.length];
//     Deno.stdout.write(encoder.encode(`\r${currentMessage} ${frame}`));
//   }, 120);
//
//   return {
//     updateProgress(processed: number, total: number, etaMs?: number) {
//       const percentage = Math.round((processed / total) * 100);
//       let progressMsg = `${baseMessage} - ${percentage}%`;
//
//       if (etaMs !== undefined && etaMs > 0) {
//         const etaSeconds = Math.ceil(etaMs / 1000);
//         const minutes = Math.floor(etaSeconds / 60);
//         const seconds = etaSeconds % 60;
//         const etaFormat = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
//         progressMsg += ` (eta ${etaFormat})`;
//       }
//
//       currentMessage = progressMsg;
//     },
//     stop(finalMessage?: string) {
//       clearInterval(timer);
//       Deno.stdout.write(encoder.encode("\r"));
//       if (finalMessage) {
//         console.log(finalMessage);
//       } else {
//         console.log("");
//       }
//     }
//   };
// }
// Enhanced progress spinner with percentage and ETA in the format:
// "Generating Preview CSV [spinner] - X% (eta MM:SS)"
function createProgressSpinner(baseMessage: string) {
  const encoder = new TextEncoder();
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  let suffix = "";

  const timer = setInterval(() => {
    const frame = frames[i = (i + 1) % frames.length];
    Deno.stdout.write(encoder.encode(`\r${baseMessage} [${frame}]${suffix}`));
  }, 120);

  return {
    updateProgress(processed: number, total: number, etaMs?: number) {
      const percentage = Math.max(
        0,
        Math.min(100, Math.round((processed / Math.max(total, 1)) * 100)),
      );
      let s = ` - ${percentage}%`;
      if (etaMs !== undefined && etaMs > 0) {
        const etaSeconds = Math.ceil(etaMs / 1000);
        const minutes = Math.floor(etaSeconds / 60);
        const seconds = etaSeconds % 60;
        const etaFormat = `${minutes.toString().padStart(2, "0")}:${
          seconds.toString().padStart(2, "0")
        }`;
        s += ` (eta ${etaFormat})`;
      }
      suffix = s;
    },
    stop(finalMessage?: string) {
      clearInterval(timer);
      Deno.stdout.write(encoder.encode("\r"));
      if (finalMessage) {
        console.log(finalMessage);
      } else {
        console.log("");
      }
    },
  };
}

// Batched CSV writer with progress and ETA
async function writeMergedCSVWithProgress(
  filePath: string,
  summary: DeletionResultSummary,
  report: DryRunReportItem[],
  batchSize = 500,
): Promise<void> {
  const start = performance.now();
  const spinner = createProgressSpinner("Generating Preview CSV");
  const encoder = new TextEncoder();
  const f = await Deno.open(filePath, {
    create: true,
    write: true,
    truncate: true,
  });
  try {
    const writeLine = async (line: string) => {
      await f.write(encoder.encode(line + "\n"));
    };

    // Summary section
    await writeLine("Summary");
    await writeLine(
      [
        "Versions Deleted",
        "Components Deleted",
        "Deleted Size (MB)",
        "Failures",
      ].join(","),
    );
    const deletedMB = (summary.bytesDeleted / (1024 * 1024)).toFixed(2);
    await writeLine([
      summary.versionsDeleted.toString(),
      summary.componentsDeleted.toString(),
      deletedMB,
      summary.failures.length.toString(),
    ].join(","));

    if (summary.failures.length > 0) {
      await writeLine("");
      await writeLine("Failures");
      await writeLine("ID,Reason");
      for (const fItem of summary.failures) {
        await writeLine(`${fItem.id},${sanitizeCsv(fItem.reason)}`);
      }
    }

    // Separator and details header
    await writeLine("");
    await writeLine("-----");
    await writeLine("");
    await writeLine("Details");
    await writeLine(
      [
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
      ].join(","),
    );

    // Details - process in batches
    const total = report.length;
    let processed = 0;
    while (processed < total) {
      const chunk = report.slice(processed, processed + batchSize);
      const lines: string[] = [];
      for (const item of chunk) {
        const sizeMB = item.size != null
          ? (item.size / (1024 * 1024)).toFixed(2)
          : "";
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
          sanitizeCsv(item.locations?.join("; ")),
        ];
        lines.push(row.join(","));
      }
      await f.write(
        encoder.encode(lines.join("\n") + (lines.length ? "\n" : "")),
      );
      processed += chunk.length;

      const elapsed = performance.now() - start;
      const avgPerItem = processed > 0 ? elapsed / processed : 0;
      const remaining = Math.max(total - processed, 0);
      const etaMs = avgPerItem > 0
        ? Math.round(avgPerItem * remaining)
        : undefined;
      spinner.updateProgress(processed, total, etaMs);
    }
  } finally {
    try {
      f.close();
    } catch {
      // Ignore write errors for progress file
    }
    spinner.stop();
  }
}

/**
 * Helper function to select asset versions from a list
 * Returns array of asset version IDs or null if cancelled
 */
async function selectFromList(
  session: Session,
  projectContextService: ProjectContextService,
): Promise<string[] | null> {
  const listService = new ListService(session, projectContextService);

  // 1) Fetch available lists
  console.log(chalk.blue("Fetching available lists..."));
  const lists = await listService.fetchAssetVersionLists();

  if (lists.length === 0) {
    console.log(chalk.yellow("No lists found in current project scope."));
    return null;
  }

  // 2) Group lists by category (similar to manageLists)
  const listsByCategory: Record<string, Array<Record<string, unknown>>> = {};
  for (const list of lists as Array<Record<string, unknown>>) {
    const category = list.category as Record<string, unknown> | undefined;
    const categoryName = category?.name as string || "Uncategorized";
    if (!listsByCategory[categoryName]) listsByCategory[categoryName] = [];
    listsByCategory[categoryName].push(list);
  }
  // Sort lists within each category
  for (const categoryName of Object.keys(listsByCategory)) {
    listsByCategory[categoryName].sort((a, b) =>
      (a.name as string || "").localeCompare(b.name as string || "")
    );
  }

  // 3) Category selection
  const categoryChoices = Object.keys(listsByCategory).map((name) => ({
    name: `${name} (${listsByCategory[name].length} lists)`,
    value: name,
  }));

  const selectedCategory = await Select.prompt({
    message: "Select a list category:",
    options: [...categoryChoices, { name: "❌ Cancel", value: "cancel" }],
  });

  if (selectedCategory === "cancel") {
    return null;
  }

  // 4) List selection within category (no pagination for now)
  const categoryLists = listsByCategory[selectedCategory];
  const listChoices = categoryLists.map((list) => ({
    name: `${list.name as string} (${(list.project as Record<string, unknown>)?.name as string || "No Project"})`,
    value: list.id as string,
  }));

  const selectedListId = await Select.prompt({
    message: `Select a list from "${selectedCategory}":`,
    options: [...listChoices, { name: "❌ Cancel", value: "cancel" }],
  });

  if (selectedListId === "cancel") {
    return null;
  }

  // 5) Resolve asset version IDs from list
  console.log(chalk.blue("Extracting asset versions from list..."));
  const versionIds = await listService.getAssetVersionIdsFromList(
    selectedListId,
  );

  if (versionIds.length === 0) {
    console.log(chalk.yellow("No asset versions found in the selected list."));
    return null;
  }

  console.log(
    chalk.green(`Found ${versionIds.length} asset versions in the list.`),
  );
  return versionIds;
}

/**
 * Delete Media Tool
 * Provides dry-run previews, CSV exports, and actual deletion for asset versions and components.
 * Supports multiple input modes: manual IDs, age-based, filter-based, and list-based selection.
 * Includes progressive safety measures: preview → export → confirm → execute.
 */
export async function deleteMediaTool(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
): Promise<void> {
  debug("Starting Delete Media Tool");

  // Enforce project-scoped only
  console.log(chalk.blue("\n📋 Delete Media Tool"));
  console.log(
    chalk.green(
      "🔒 Safe actions are clearly marked - actual deletion only occurs after final confirmation.",
    ),
  );
  console.log(
    chalk.blue(
      "📊 Progress Timeline: Select Mode → Preview (safe) → Export CSV (safe) → Confirm → Execute",
    ),
  );

  const mode = (await Select.prompt({
    message: "Select deletion mode (safe - no deletion yet)",
    options: [
      { name: "Delete whole asset versions", value: "versions" },
      {
        name: "Delete components only (original/encoded) (safe)",
        value: "components",
      },
      { name: "Age-based cleanup", value: "age" },
      { name: "Filter-based deletion", value: "filter" },
    ],
  })) as DeleteMode;

  const sessionService = new SessionService(session);
  const deletionService = new DeletionService(
    session,
    sessionService,
    queryService,
  );

  if (mode === "versions") {
    // Choose input method
    const inputMethod = await Select.prompt({
      message: "How would you like to specify asset versions?",
      options: [
        { name: "Enter AssetVersion IDs directly", value: "ids" },
        { name: "Select-all from list", value: "list" },
        { name: "🔍 Advanced selection (search, wildcards, filters)", value: "advanced" },
      ],
    });

    let versionIds: string[] = [];

    if (inputMethod === "ids") {
      const idsRaw = await Input.prompt({
        message: "Enter AssetVersion IDs to preview delete (comma-separated)",
        default: "",
      });
      versionIds = idsRaw.split(/[\,\s]+/).map((s) => s.trim()).filter(
        Boolean,
      );

      if (versionIds.length === 0) {
        console.log(chalk.yellow("No IDs provided. Aborting."));
        return;
      }
    } else if (inputMethod === "list") {
      // Select from list
      const listVersionIds = await selectFromList(
        session,
        projectContextService,
      );
      if (!listVersionIds) {
        console.log(chalk.yellow("Operation cancelled."));
        return;
      }
      versionIds = listVersionIds;
    } else {
      // Advanced selection
      const advancedSelectionService = new AdvancedSelectionService(
        session,
        projectContextService,
        queryService,
      );
      const result = await advancedSelectionService.selectAssetVersions({
        pageSize: 15,
        enableSearch: true,
        enableWildcards: true,
        enableFuzzySearch: true,
        allowMultiple: true,
        showMetadata: true,
      });

      if (result.cancelled) {
        console.log(chalk.yellow("Selection cancelled."));
        return;
      }

      if (result.searchUsed && result.patterns) {
        console.log(chalk.green(`Selected ${result.items.length} asset versions using patterns: ${result.patterns.join(", ")}`));
      } else {
        console.log(chalk.green(`Selected ${result.items.length} asset versions`));
      }

      versionIds = result.items.map(item => item.id);
    }

    const { report, summary } = await deletionService.deleteAssetVersions(
      versionIds,
      { dryRun: true },
    );

    console.log(
      chalk.green(
        `\nPreview generated for ${versionIds.length} AssetVersion ID(s).`,
      ),
    );

    // Export dry-run details to Downloads directory
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);

    if (!canWrite) {
      console.log(
        chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`),
      );
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath =
        `${downloadsDir}/delete-media-preview-${timestamp}.csv`;

      try {
        await writeMergedCSVWithProgress(mergedPath, summary, report);
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
    console.log(
      ` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`,
    );

    // Typed confirmation gating sample (per decisions)
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({
        message: `Type "DELETE NOW" to confirm preview completion`,
        default: "",
      });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({
        message:
          "⚠️  FINAL CONFIRMATION: Delete these asset versions permanently?",
        default: false,
      });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    if (proceed) {
      console.log(chalk.red("🗑️  Executing deletion..."));

      // Perform actual deletion
      const deletionResult = await deletionService.deleteAssetVersions(
        versionIds,
        { dryRun: false },
      );

      // Show final results
      console.log(chalk.green(`\n✅ Deletion completed!`));
      console.log(
        `Successfully processed: ${deletionResult.summary.versionsDeleted} versions`,
      );
      console.log(
        `Total size freed: ${
          DeletionService.formatBytes(deletionResult.summary.bytesDeleted)
        }`,
      );

      if (deletionResult.summary.failures.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠️  ${deletionResult.summary.failures.length} failures occurred:`,
          ),
        );
        deletionResult.summary.failures.forEach((failure) => {
          console.log(chalk.red(`  - ${failure.id}: ${failure.reason}`));
        });
      }
    } else {
      console.log(chalk.yellow("Deletion cancelled by user."));
    }
    return;
  }

  if (mode === "components") {
    // Choose input method
    const inputMethod = await Select.prompt({
      message: "How would you like to specify asset versions?",
      options: [
        { name: "Enter AssetVersion IDs directly", value: "ids" },
        { name: "Search by shot name(s)", value: "shots" },
        { name: "Select-all from list", value: "list" },
        { name: "🔍 Advanced selection (search, wildcards, filters)", value: "advanced" },
      ],
    });

    let versionIds: string[] = [];

    if (inputMethod === "ids") {
      const idsRaw = await Input.prompt({
        message:
          "Enter AssetVersion IDs to preview component delete (comma-separated)",
        default: "",
      });
      versionIds = idsRaw.split(/[\,\s]+/).map((s) => s.trim()).filter(
        Boolean,
      );
    } else if (inputMethod === "shots") {
      // Search by shot names
      const shotNamesRaw = await Input.prompt({
        message:
          "Enter shot name(s) to find asset versions (comma-separated). Tip: use wildcard * (e.g., SHOT02*)",
        default: "",
      });
      const shotNames = shotNamesRaw.split(/[\,\s]+/).map((s) => s.trim())
        .filter(Boolean);

      if (shotNames.length === 0) {
        console.log(chalk.yellow("No shot names provided. Aborting."));
        return;
      }

      // Search for asset versions in specified shots
      console.log(
        chalk.blue("Searching for asset versions in specified shots..."),
      );

      // Build query with wildcard support
      const shotFilters = shotNames.map((name) => {
        if (name.includes("*")) {
          // Translate '*' to SQL LIKE '%' for Ftrack query
          const pattern = name.replaceAll("*", "%");
          return `asset.parent.name like "${pattern}"`;
        }
        // Exact match
        return `asset.parent.name is "${name}"`;
      });

      const shotFilter = shotFilters.join(" or ");
      const result = await queryService.queryAssetVersions(shotFilter);

      if (!result.data || result.data.length === 0) {
        console.log(
          chalk.yellow(
            `No asset versions found in shots: ${shotNames.join(", ")}`,
          ),
        );
        return;
      }

      // Display found versions and let user select
      const versionOptions = (result.data as Array<Record<string, unknown>>).map((version) => {
        const asset = version.asset as Record<string, unknown> | undefined;
          const parent = asset?.parent as Record<string, unknown> | undefined;
          const shotName = parent?.name as string || "Unknown";
          const assetName = asset?.name as string || "Unknown";
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
        versionIds = (result.data as Array<{ id: string }>).map((v) => v.id as string);
      } else {
        versionIds = selectedVersions.filter((id) => id !== "all");
      }
    } else if (inputMethod === "list") {
      // Select from list
      const listVersionIds = await selectFromList(
        session,
        projectContextService,
      );
      if (!listVersionIds) {
        console.log(chalk.yellow("Operation cancelled."));
        return;
      }
      versionIds = listVersionIds;
    } else {
      // Advanced selection
      const advancedSelectionService = new AdvancedSelectionService(
        session,
        projectContextService,
        queryService,
      );
      const result = await advancedSelectionService.selectAssetVersions({
        pageSize: 15,
        enableSearch: true,
        enableWildcards: true,
        enableFuzzySearch: true,
        allowMultiple: true,
        showMetadata: true,
      });

      if (result.cancelled) {
        console.log(chalk.yellow("Selection cancelled."));
        return;
      }

      if (result.searchUsed && result.patterns) {
        console.log(chalk.green(`Selected ${result.items.length} asset versions using patterns: ${result.patterns.join(", ")}`));
      } else {
        console.log(chalk.green(`Selected ${result.items.length} asset versions`));
      }

      versionIds = result.items.map(item => item.id);
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
        const filter = `id in (${
          versionIds.map((id) => `"${id}"`).join(", ")
        })`;
        const details = await queryService.queryAssetVersions(filter);
        for (const v of details.data as Array<Record<string, unknown>>) {
          const asset = v.asset as Record<string, unknown> | undefined;
          const parent = asset?.parent as Record<string, unknown> | undefined;
          const shotName = parent?.name as string || "Unknown";
          const assetName = asset?.name as string || "Unknown";
          const versionNum = v.version || "?";
          displayMap.set(
            v.id as string,
            `${shotName} - ${assetName} v${versionNum} - ${v.id}`,
          );
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

    // Remove inner spinner definition and use shared one
    // Spinner during enumeration/generation
    const spinner = createSpinner("Generating preview...");
    let report: DryRunReportItem[] = [];
    let summary: DeletionResultSummary;
    try {
      const result = await deletionService.deleteComponents(choiceMap, {
        dryRun: true,
      });
      report = result.report;
      summary = result.summary;
    } finally {
      spinner.stop();
    }

    console.log(
      chalk.green(
        `\nPreview generated for ${versionIds.length} AssetVersion ID(s).`,
      ),
    );

    // Export dry-run details to Downloads directory
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);

    if (!canWrite) {
      console.log(
        chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`),
      );
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath =
        `${downloadsDir}/delete-media-components-preview-${timestamp}.csv`;

      try {
        await writeMergedCSVWithProgress(mergedPath, summary, report);
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
    console.log(
      ` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`,
    );

    // Typed confirmation gating sample (per decisions)
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({
        message: `Type "DELETE NOW" to confirm preview completion`,
        default: "",
      });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({
        message: "⚠️  FINAL CONFIRMATION: Delete these components permanently?",
        default: false,
      });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    if (proceed) {
      console.log(chalk.red("🗑️  Executing component deletion..."));

      // Perform actual deletion
      const deletionResult = await deletionService.deleteComponents(choiceMap, {
        dryRun: false,
      });

      // Show final results
      console.log(chalk.green(`\n✅ Component deletion completed!`));
      console.log(
        `Successfully processed: ${deletionResult.summary.versionsDeleted} versions`,
      );
      console.log(
        `Components deleted: ${deletionResult.summary.componentsDeleted}`,
      );
      console.log(
        `Total size freed: ${
          DeletionService.formatBytes(deletionResult.summary.bytesDeleted)
        }`,
      );

      if (deletionResult.summary.failures.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠️  ${deletionResult.summary.failures.length} failures occurred:`,
          ),
        );
        deletionResult.summary.failures.forEach((failure) => {
          console.log(chalk.red(`  - ${failure.id}: ${failure.reason}`));
        });
      }
    } else {
      console.log(chalk.yellow("Deletion cancelled by user."));
    }
    return;
  }

  if (mode === "age") {
    // Age-based cleanup mode
    const ageType = await Select.prompt({
      message: "Select age filter type",
      options: [
        { name: "Older than specific date", value: "older" },
        { name: "Newer than specific date", value: "newer" },
        { name: "Between two dates", value: "between" },
      ],
    });

    let fromDate: string | undefined;
    let toDate: string | undefined;

    if (ageType === "older") {
      toDate = await Input.prompt({
        message:
          "Enter date (YYYY-MM-DD) - versions older than this will be selected:",
        validate: (input) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
    } else if (ageType === "newer") {
      fromDate = await Input.prompt({
        message:
          "Enter date (YYYY-MM-DD) - versions newer than this will be selected:",
        validate: (input) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
    } else if (ageType === "between") {
      fromDate = await Input.prompt({
        message: "Enter start date (YYYY-MM-DD):",
        validate: (input) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      toDate = await Input.prompt({
        message: "Enter end date (YYYY-MM-DD):",
        validate: (input) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
    }

    // Choose what to delete from matched versions
    const deletionType = await Select.prompt({
      message: "What should be deleted from matched asset versions?",
      options: [
        { name: "Delete whole asset versions", value: "versions" },
        { name: "Delete components only (safe)", value: "components" },
      ],
    });

    let componentChoice: ComponentDeletionChoice = "all";
    if (deletionType === "components") {
      componentChoice = await Select.prompt({
        message: "Which components to delete? (safe)",
        options: [
          { name: "All components", value: "all" },
          { name: "Only original", value: "original_only" },
          { name: "Only encoded", value: "encoded_only" },
        ],
      }) as ComponentDeletionChoice;
    }

    // Build date filter using FilterService (static import)
    const filterService = new FilterService();
    const dateFilter = {
      kind: ageType as "older" | "newer" | "between",
      from: fromDate,
      to: toDate,
    };

    const whereClause = filterService.buildWhere({ date: dateFilter });

    console.log(
      chalk.blue("Searching for asset versions matching age criteria..."),
    );

    // Query asset versions with date filter
    const result = await queryService.queryAssetVersions(whereClause);

    if (!result.data || result.data.length === 0) {
      console.log(
        chalk.yellow("No asset versions found matching the age criteria."),
      );
      return;
    }

    const versionIds = (result.data as Array<{ id: string }>).map((v) => v.id);
    console.log(
      chalk.green(
        `Found ${versionIds.length} asset versions matching age criteria.`,
      ),
    );

    // Perform deletion based on type
    let report: DryRunReportItem[] = [];
    let summary: DeletionResultSummary;

    const spinner = createSpinner("Generating preview...");
    try {
      if (deletionType === "versions") {
        const result = await deletionService.deleteAssetVersions(versionIds, {
          dryRun: true,
        });
        report = result.report;
        summary = result.summary;
      } else {
        // Components mode
        const choiceMap = new Map<string, ComponentDeletionChoice>();
        for (const id of versionIds) choiceMap.set(id, componentChoice);

        const result = await deletionService.deleteComponents(choiceMap, {
          dryRun: true,
        });
        report = result.report;
        summary = result.summary;
      }
    } finally {
      spinner.stop();
    }

    console.log(
      chalk.green(
        `\nAge-based preview generated for ${versionIds.length} AssetVersion(s).`,
      ),
    );

    // Export and summary logic (reuse existing code)
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);

    if (!canWrite) {
      console.log(
        chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`),
      );
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath =
        `${downloadsDir}/delete-media-age-preview-${timestamp}.csv`;

      try {
        await writeMergedCSVWithProgress(mergedPath, summary, report);
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
    console.log(
      ` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`,
    );

    // Confirmation gating
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({
        message: `Type "DELETE NOW" to confirm preview completion`,
        default: "",
      });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({
        message:
          "⚠️  FINAL CONFIRMATION: Delete these asset versions permanently?",
        default: false,
      });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    if (proceed) {
      console.log(chalk.red("🗑️  Executing deletion..."));

      // Perform actual deletion
      const deletionResult = await deletionService.deleteAssetVersions(
        versionIds,
        { dryRun: false },
      );

      // Show final results
      console.log(chalk.green(`\n✅ Deletion completed!`));
      console.log(
        `Successfully processed: ${deletionResult.summary.versionsDeleted} versions`,
      );
      console.log(
        `Total size freed: ${
          DeletionService.formatBytes(deletionResult.summary.bytesDeleted)
        }`,
      );

      if (deletionResult.summary.failures.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠️  ${deletionResult.summary.failures.length} failures occurred:`,
          ),
        );
        deletionResult.summary.failures.forEach((failure) => {
          console.log(chalk.red(`  - ${failure.id}: ${failure.reason}`));
        });
      }
    } else {
      console.log(chalk.yellow("Deletion cancelled by user."));
    }
    return;
  }

  if (mode === "filter") {
    // Choose which filters to apply
    const selectedFilters = await Checkbox.prompt({
      message: "Select filters to apply",
      options: [
        { name: "Status (by name)", value: "status_names" },
        { name: "User (by username)", value: "usernames" },
        { name: "Date (older/newer/between)", value: "date" },
        { name: "Custom Attributes", value: "custom" },
      ],
    }) as string[];

    let statusNames: string[] | undefined;
    let usernames: string[] | undefined;
    let dateKind: "older" | "newer" | "between" | undefined;
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    const customFilters: {
      key: string;
      op: "eq" | "neq" | "contains" | "true" | "false";
      value?: string;
    }[] = [];

    if (selectedFilters.includes("status_names")) {
      const raw = await Input.prompt({
        message: "Enter status name(s) (comma-separated)",
        default: "",
      });
      statusNames = raw.split(/[\,\s]+/).map((s) => s.trim()).filter(
        Boolean,
      );
    }

    if (selectedFilters.includes("usernames")) {
      const raw = await Input.prompt({
        message: "Enter username(s) (comma-separated)",
        default: "",
      });
      usernames = raw.split(/[\,\s]+/).map((s) => s.trim()).filter(
        Boolean,
      );
    }

    if (selectedFilters.includes("date")) {
      dateKind = await Select.prompt({
        message: "Select date filter type",
        options: [
          { name: "Older than specific date", value: "older" },
          { name: "Newer than specific date", value: "newer" },
          { name: "Between two dates", value: "between" },
        ],
      }) as "older" | "newer" | "between";

      if (dateKind === "older") {
        dateTo = await Input.prompt({
          message:
            "Enter date (YYYY-MM-DD) - versions older than this will be selected:",
          validate: (
            input,
          ) => (/^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter date in YYYY-MM-DD format"),
        });
      } else if (dateKind === "newer") {
        dateFrom = await Input.prompt({
          message:
            "Enter date (YYYY-MM-DD) - versions newer than this will be selected:",
          validate: (
            input,
          ) => (/^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter date in YYYY-MM-DD format"),
        });
      } else {
        dateFrom = await Input.prompt({
          message: "Enter start date (YYYY-MM-DD):",
          validate: (
            input,
          ) => (/^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter date in YYYY-MM-DD format"),
        });
        dateTo = await Input.prompt({
          message: "Enter end date (YYYY-MM-DD):",
          validate: (
            input,
          ) => (/^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter date in YYYY-MM-DD format"),
        });
      }
    }

    if (selectedFilters.includes("custom")) {
      let addMore = true;
      while (addMore) {
        const key = await Input.prompt({
          message: "Custom attribute key (exact)",
          default: "",
        });
        const op = await Select.prompt({
          message: `Operator for ${key}`,
          options: [
            { name: "equals", value: "eq" },
            { name: "not equals", value: "neq" },
            { name: "contains", value: "contains" },
            { name: "is true", value: "true" },
            { name: "is false", value: "false" },
          ],
        }) as "eq" | "neq" | "contains" | "true" | "false";

        let value: string | undefined;
        if (op === "eq" || op === "neq" || op === "contains") {
          value = await Input.prompt({ message: `Value for ${key}` });
        }

        customFilters.push({ key, op, value });
        addMore = await Confirm.prompt({
          message: "Add another custom attribute filter?",
          default: false,
        });
      }
    }

    // Build where clause
    const filterService = new FilterService();
    const whereClause = filterService.buildWhere({
      status: statusNames?.length ? { names: statusNames } : undefined,
      user: usernames?.length ? { usernames } : undefined,
      date: dateKind
        ? { kind: dateKind, from: dateFrom, to: dateTo }
        : undefined,
      custom: customFilters.length ? customFilters : undefined,
    });

    if (!whereClause) {
      console.log(chalk.yellow("No filters specified. Aborting."));
      return;
    }

    console.log(chalk.blue("Searching for asset versions matching filters..."));
    const avResult = await queryService.queryAssetVersions(whereClause);
    if (!avResult.data || avResult.data.length === 0) {
      console.log(
        chalk.yellow("No asset versions found matching the filters."),
      );
      return;
    }

    const versionIds = (avResult.data as Array<{ id: string }>).map((v) => v.id);
    console.log(
      chalk.green(
        `Found ${versionIds.length} asset versions matching filters.`,
      ),
    );

    // Choose deletion scope
    const deletionType = await Select.prompt({
      message: "What should be deleted from matched asset versions?",
      options: [
        { name: "Delete whole asset versions", value: "versions" },
        { name: "Delete components only (safe)", value: "components" },
      ],
    });

    let componentChoice: ComponentDeletionChoice = "all";
    if (deletionType === "components") {
      componentChoice = await Select.prompt({
        message: "Which components to delete? (safe)",
        options: [
          { name: "All components", value: "all" },
          { name: "Only original", value: "original_only" },
          { name: "Only encoded", value: "encoded_only" },
        ],
      }) as ComponentDeletionChoice;
    }

    // Preview
    const spinner = createSpinner("Generating preview...");
    let report: DryRunReportItem[] = [];
    let summary: DeletionResultSummary;
    try {
      if (deletionType === "versions") {
        const result = await deletionService.deleteAssetVersions(versionIds, {
          dryRun: true,
        });
        report = result.report;
        summary = result.summary;
      } else {
        const choiceMap = new Map<string, ComponentDeletionChoice>();
        for (const id of versionIds) choiceMap.set(id, componentChoice);
        const result = await deletionService.deleteComponents(choiceMap, {
          dryRun: true,
        });
        report = result.report;
        summary = result.summary;
      }
    } finally {
      spinner.stop();
    }

    console.log(
      chalk.green(
        `\nFilter-based preview generated for ${versionIds.length} AssetVersion(s).`,
      ),
    );

    // Export
    const downloadsDir = getDownloadsDirectory();
    const canWrite = await verifyDirectoryAccess(downloadsDir);
    if (!canWrite) {
      console.log(
        chalk.red(`❌ Cannot write to Downloads directory at: ${downloadsDir}`),
      );
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const mergedPath =
        `${downloadsDir}/delete-media-filter-preview-${timestamp}.csv`;
      try {
        const _mergedCsv = formatMergedCSV(summary, report);
        await writeMergedCSVWithProgress(mergedPath, summary, report);
        console.log(chalk.green("\n📝 Dry-run export created:"));
        console.log(` - Merged: ${mergedPath}`);
      } catch (err) {
        debug(`Failed to write dry-run export: ${err}`);
        console.log(chalk.red("Failed to write dry-run export file."));
      }
    }

    // Summary
    console.log(`\nSummary:`);
    console.log(` - Versions: ${summary.versionsDeleted}`);
    console.log(` - Components: ${summary.componentsDeleted}`);
    console.log(
      ` - Size (MB): ${(summary.bytesDeleted / (1024 * 1024)).toFixed(2)}`,
    );

    // Confirmation gating
    const needsTyped = versionIds.length > 1;
    let proceed = false;
    if (needsTyped) {
      const confirmText = await Input.prompt({
        message: `Type "DELETE NOW" to confirm preview completion`,
        default: "",
      });
      proceed = confirmText.trim() === "DELETE NOW";
    } else {
      proceed = await Confirm.prompt({
        message:
          "⚠️  FINAL CONFIRMATION: Delete these asset versions permanently?",
        default: false,
      });
    }

    if (!proceed) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    if (proceed) {
      console.log(chalk.red("🗑️  Executing deletion..."));

      // Perform actual deletion
      const deletionResult = await deletionService.deleteAssetVersions(
        versionIds,
        { dryRun: false },
      );

      // Show final results
      console.log(chalk.green(`\n✅ Deletion completed!`));
      console.log(
        `Successfully processed: ${deletionResult.summary.versionsDeleted} versions`,
      );
      console.log(
        `Total size freed: ${
          DeletionService.formatBytes(deletionResult.summary.bytesDeleted)
        }`,
      );

      if (deletionResult.summary.failures.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠️  ${deletionResult.summary.failures.length} failures occurred:`,
          ),
        );
        deletionResult.summary.failures.forEach((failure) => {
          console.log(chalk.red(`  - ${failure.id}: ${failure.reason}`));
        });
      }
    } else {
      console.log(chalk.yellow("Deletion cancelled by user."));
    }
    return;
  }

  // End
}

function formatMergedCSV(
  summary: DeletionResultSummary,
  report: DryRunReportItem[],
): string {
  const lines: string[] = [];
  // Summary section with human-readable headers and MB conversion
  lines.push("Summary");
  const summaryHeaders = [
    "Versions Deleted",
    "Components Deleted",
    "Deleted Size (MB)",
    "Failures",
  ];
  const deletedMB = (summary.bytesDeleted / (1024 * 1024)).toFixed(2);
  const summaryValues = [
    summary.versionsDeleted.toString(),
    summary.componentsDeleted.toString(),
    deletedMB,
    summary.failures.length.toString(),
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
    const sizeMB = item.size != null
      ? (item.size / (1024 * 1024)).toFixed(2)
      : "";
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
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
