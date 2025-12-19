/**
 * Types for Delete Media Tool
 *
 * Defines modes, reporting structures and result summaries used by the tool
 */

export type DeleteMode = "versions" | "components" | "age" | "filter";
export type ComponentDeletionChoice = "all" | "original_only" | "encoded_only";

export interface DryRunReportItem {
	operation: "delete_version" | "delete_components";
	assetVersionId: string;
	assetVersionLabel?: string;
	shotName?: string;
	status?: string;
	user?: string;
	componentId?: string;
	componentName?: string;
	componentType?: string;
	size?: number;
	locations?: string[];
}

export interface DeletionResultSummary {
	versionsDeleted: number;
	componentsDeleted: number;
	bytesDeleted: number;
	failures: Array<{ id: string; reason: string }>; // aggregate failures with context
}
