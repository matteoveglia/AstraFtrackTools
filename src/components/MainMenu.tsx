import type React from "react";
import { useState } from "react";
import { Box, Text } from "ink";
import type { Session } from "@ftrack/api";
import { SelectInput } from "./common/SelectInput.tsx";
import type { SessionService } from "../services/session.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import {
	displayProjectContext,
	type ProjectContext,
} from "../utils/projectSelection.ts";
import { ToolRunner } from "./ToolRunner.tsx";
import { Settings } from "./Settings.tsx";

interface MainMenuProps {
	session: Session;
	projectContext: ProjectContext;
	sessionService: SessionService;
	projectContextService: ProjectContextService;
	queryService: QueryService;
	onChangeProject: () => void;
	onCredentialsUpdated?: (server: string, user: string, key: string) => void;
	onExit: () => void;
}

interface MenuItem {
	label: string;
	value: string;
	disabled?: boolean;
	hasSubMenu?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
	session,
	projectContext,
	sessionService,
	projectContextService,
	queryService,
	onChangeProject,
	onCredentialsUpdated,
	onExit,
}) => {
	const [activeTool, setActiveTool] = useState<string | null>(null);
	const [subMenuContext, setSubMenuContext] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);

	const projectTools: MenuItem[] = [
		{
			label:
				"📁 Update Latest Versions Sent - Updates all shots with their latest delivered version",
			value: "updateVersions",
		},
		{
			label: "📁 Manage Lists - Create, Edit and Delete Lists",
			value: "manageLists",
		},
		{
			label: "📁 Download Media - Download media files from Versions",
			value: "downloadMedia",
		},
		{
			label:
				"📁 Delete Media - Delete media (versions or components) with preview and confirmation",
			value: "deleteMedia",
		},
		{
			label:
				"📁 Propagate Thumbnails - Update shots with thumbnails from their latest versions",
			value: "propagateThumbnails",
		},
	];

	const globalTools: MenuItem[] = [
		{
			label:
				"🌍 Export Schema - Dev Tool: Exports schema information for major entity types",
			value: "exportSchema",
			hasSubMenu: true,
		},
		{
			label:
				"🌍 Inspect Version - Inspect a specific version's details and relationships",
			value: "inspectVersion",
		},
		{
			label:
				"🌍 Inspect Shot - Inspect a specific shot's details and relationships",
			value: "inspectShot",
		},
		{
			label:
				"🌍 Inspect Task - Inspect a specific task's details and relationships",
			value: "inspectTask",
		},
		{
			label: "🌍 Inspect Note - Inspect a specific note and its attachments",
			value: "inspectNote",
		},
	];

	const menuItems: MenuItem[] = [
		{ label: "─── Project Based ───", value: "sep-project", disabled: true },
		...projectTools,
		{
			label: "─── All Projects - tools ignore project selection ───",
			value: "sep-global",
			disabled: true,
		},
		...globalTools,
		{ label: "─── Utilities ───", value: "sep-utils", disabled: true },
		{ label: "⚙️  Settings", value: "settings" },
		{ label: "Change Project", value: "change-project" },
		{ label: "Exit", value: "exit" },
	];

	const exportSchemaSubMenu: MenuItem[] = [
		{ label: "Export to JSON", value: "json" },
		{ label: "Export to YAML", value: "yaml" },
		{ label: "Export to CSV", value: "csv" },
		{ label: "Generate TypeScript (.ts) file", value: "ts" },
		{ label: "← Back", value: "back" },
	];

	const handleMenuSelection = (value: string) => {
		if (value === "exit") {
			onExit();
		} else if (value === "change-project") {
			onChangeProject();
		} else if (value === "settings") {
			setShowSettings(true);
		} else if (value === "exportSchema") {
			setSubMenuContext("exportSchema");
		} else {
			setActiveTool(value);
		}
	};

	const handleSettingsBack = () => {
		setShowSettings(false);
	};

	const handleSubMenuSelection = (value: string) => {
		if (value === "back") {
			setSubMenuContext(null);
		} else {
			setActiveTool(`${subMenuContext}:${value}`);
			setSubMenuContext(null);
		}
	};

	const handleToolComplete = () => {
		setActiveTool(null);
	};

	// If settings is active, show settings
	if (showSettings) {
		return (
			<Settings
				onBack={handleSettingsBack}
				onCredentialsUpdated={onCredentialsUpdated}
			/>
		);
	}

	// If a tool is active, show the tool runner
	if (activeTool) {
		return (
			<ToolRunner
				toolValue={activeTool}
				session={session}
				sessionService={sessionService}
				projectContextService={projectContextService}
				queryService={queryService}
				onComplete={handleToolComplete}
				onExit={onExit}
			/>
		);
	}

	// If in submenu context
	if (subMenuContext === "exportSchema") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Export Schema
				</Text>
				<Text>
					[{displayProjectContext(projectContext)}]{"\n"}
				</Text>
				<Text>Select export format:{"\n"}</Text>
				<SelectInput
					items={exportSchemaSubMenu}
					onSelect={handleSubMenuSelection}
				/>
			</Box>
		);
	}

	// Main menu
	return (
		<Box flexDirection="column" padding={1}>
			<Text color="cyan" bold>
				Astra Ftrack Tools
			</Text>
			<Text>
				[{displayProjectContext(projectContext)}]{"\n"}
			</Text>
			<Text>Select a tool to run:{"\n"}</Text>
			<SelectInput items={menuItems} onSelect={handleMenuSelection} />
		</Box>
	);
};
