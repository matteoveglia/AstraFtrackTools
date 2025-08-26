import { Session } from "@ftrack/api";
import { Select } from "@cliffy/prompt";
import { debug } from "./debug.ts";

export interface Project {
  id: string;
  name: string;
  full_name: string;
}

export interface ProjectContext {
  project: Project | null;
  isGlobal: boolean;
}

/**
 * Fetches all available projects from Ftrack
 */
export async function fetchProjects(session: Session): Promise<Project[]> {
  debug("Fetching available projects");

  console.log("Loading projects... ⏳");

  try {
    const response = await session.query(
      "select id, name, full_name from Project",
    );

    const projects = response.data as Project[];
    debug(`Found ${projects.length} projects`);

    // Clear the loading message
    console.log(`\r✅ Loaded ${projects.length} projects`);

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    debug(`Error fetching projects: ${error}`);
    console.log("\r❌ Failed to load projects");
    throw new Error(
      `Failed to fetch projects: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Prompts user to select a project or choose global mode
 */
export async function selectProject(session: Session): Promise<ProjectContext> {
  debug("Starting project selection");

  const projects = await fetchProjects(session);

  if (projects.length === 0) {
    console.log("⚠️  No active projects found. Operating in global mode.");
    return { project: null, isGlobal: true };
  }

  const options = [
    { name: "🌐 all projects, site-wide", value: "global" },
    ...projects.map((project) => ({
      name: `📁 ${project.name} (${project.full_name})`,
      value: project.id,
    })),
  ];

  const selection = await Select.prompt({
    message: "Select project scope:",
    options,
  });

  if (selection === "global") {
    debug("User selected global mode");
    return { project: null, isGlobal: true };
  }

  const selectedProject = projects.find((p) => p.id === selection);
  if (!selectedProject) {
    throw new Error("Invalid project selection");
  }

  debug(
    `User selected project: ${selectedProject.name} (${selectedProject.id})`,
  );
  return { project: selectedProject, isGlobal: false };
}

/**
 * Displays current project context
 */
export function displayProjectContext(context: ProjectContext): string {
  if (context.isGlobal) {
    return "🌐 all projects, site-wide";
  }
  return `📁 ${context.project?.name || "Unknown Project"}`;
}
