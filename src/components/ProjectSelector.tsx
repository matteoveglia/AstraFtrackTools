import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Session } from "@ftrack/api";
import { SelectInput } from "./common/SelectInput.tsx";
import { type ProjectContext } from "../utils/projectSelection.ts";

interface ProjectSelectorProps {
  session: Session;
  onProjectSelected: (context: ProjectContext) => void;
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
  onExit,
}) => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const results = await session.query(
        'select id, name, full_name from Project where status is "active"'
      );
      setProjects(results as Project[]);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleSelection = (value: string) => {
    if (value === "all-projects") {
      onProjectSelected({ mode: "all-projects" });
    } else if (value === "exit") {
      onExit();
    } else {
      const project = projects.find((p) => p.id === value);
      if (project) {
        onProjectSelected({
          mode: "project",
          projectId: project.id,
          projectName: project.full_name,
        });
      }
    }
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

  const items = [
    { label: "── Project Scope ──", value: "separator-1", disabled: true },
    ...projects.map((project) => ({
      label: `  ${project.full_name}`,
      value: project.id,
    })),
    { label: "", value: "separator-2", disabled: true },
    { label: "── Special Modes ──", value: "separator-3", disabled: true },
    {
      label: "  All Projects (ignore project selection)",
      value: "all-projects",
    },
    { label: "", value: "separator-4", disabled: true },
    { label: "Exit", value: "exit" },
  ];

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
