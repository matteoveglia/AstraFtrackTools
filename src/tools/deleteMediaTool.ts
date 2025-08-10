import type { Session } from "@ftrack/api";
import { Select, Confirm, Input } from "@cliffy/prompt";
import chalk from "chalk";
import { debug } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import { DeletionService } from "../services/deletionService.ts";
import type { DeleteMode } from "../types/deleteMedia.ts";

/**
 * Delete Media Tool (scaffold)
 * Currently provides a dry-run-only placeholder flow.
 */
export async function deleteMediaTool(
  session: Session,
  projectContextService: ProjectContextService,
  _queryService: QueryService,
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

  const deletionService = new DeletionService(session);

  if (mode === "versions") {
    const idsRaw = await Input.prompt({
      message: "Enter AssetVersion IDs to preview delete (comma-separated)",
      default: "",
    });
    const versionIds = idsRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

    if (versionIds.length === 0) {
      console.log(chalk.yellow("No IDs provided. Aborting."));
      return;
    }

    const { report, summary } = await deletionService.deleteAssetVersions(versionIds, { dryRun: true });

    console.log(chalk.green(`\nPreview - ${report.length} version(s) would be deleted.`));
    report.forEach((r) => console.log(`- AssetVersion ${r.assetVersionId}`));
    console.log(`Totals: versions=${summary.versionsDeleted}, components=${summary.componentsDeleted}, bytes=${summary.bytesDeleted}`);

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