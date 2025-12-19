import type React from "react";
import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Session } from "@ftrack/api";
import { SelectInput } from "./common/SelectInput.tsx";
import { Settings } from "./Settings.tsx";
import type { ProjectContext } from "../utils/projectSelection.ts";

interface ProjectSelectorProps {
	session: Session;
	onProjectSelected: (context: ProjectContext) => void;
	onCredentialsUpdated?: (server: string, user: string, key: string) => void;
	onExit: () => void;
}

interface Project {
	id: string;
	name: string;
	full_name: string;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
	session,
	onProjectSelected,
	onCredentialsUpdated,
	onExit,
}: ProjectSelectorProps) => {
	const [loading, setLoading] = useState(true);
	const [projects, setProjects] = useState<Project[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);

	useEffect(() => {
		loadProjects();
	}, []);

	const loadProjects = async (): Promise<void> => {
		try {
			setLoading(true);
			const response = (await session.query(
				'select id, name, full_name from Project where status is "active"',
			)) as unknown as { data?: Project[] };

			// Ftrack API returns data in a .data property
			const projectsArray = Array.isArray(response.data) ? response.data : [];

			setProjects(projectsArray);
			setLoading(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setLoading(false);
		}
	};

	const handleSelection = (value: string) => {
		if (value === "all-projects") {
			onProjectSelected({ project: null, isGlobal: true });
		} else if (value === "settings") {
			setShowSettings(true);
		} else if (value === "exit") {
			onExit();
		} else {
			const project = projects.find((project: Project) => project.id === value);
			if (project) {
				onProjectSelected({
					project: project,
					isGlobal: false,
				});
			}
		}
	};

	const handleSettingsBack = () => {
		setShowSettings(false);
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Project Selection
				</Text>
				<Text>Loading projects...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red" bold>
					Error
				</Text>
				<Text>{error}</Text>
			</Box>
		);
	}

	// Ensure projects is always an array before mapping
	const projectItems = Array.isArray(projects)
		? projects.map((project) => ({
				label: `  ${project.full_name}`,
				value: project.id,
			}))
		: [];

	const items = [
		{ label: "── Project Scope ──", value: "separator-1", disabled: true },
		...projectItems,
		{ label: "", value: "separator-2", disabled: true },
		{ label: "── Special Modes ──", value: "separator-3", disabled: true },
		{
			label: "  All Projects (ignore project selection)",
			value: "all-projects",
		},
		{ label: "", value: "separator-4", disabled: true },
		{ label: "── Options ──", value: "separator-5", disabled: true },
		{ label: "⚙️  Settings", value: "settings" },
		{ label: "Exit", value: "exit" },
	];

	// If settings is active, show settings
	if (showSettings) {
		return (
			<Settings
				onBack={handleSettingsBack}
				onCredentialsUpdated={onCredentialsUpdated}
			/>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text color="cyan" bold>
				Project Selection
			</Text>
			<Text>
				{"\n"}Select a project or mode:{"\n"}
			</Text>
			<SelectInput items={items} onSelect={handleSelection} />
		</Box>
	);
};
