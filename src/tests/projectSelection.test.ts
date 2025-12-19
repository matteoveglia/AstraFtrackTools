import { assertEquals } from "@std/assert";
import type { Session } from "@ftrack/api";
import {
	displayProjectContext,
	fetchProjects,
	type ProjectContext,
} from "../utils/projectSelection.ts";

// Mock session for testing
const createMockSession = () => {
	return {
		query: (expression: string) => {
			// Mock response for projects query
			if (expression.includes("select id, name, full_name from Project")) {
				return Promise.resolve({
					data: [
						{ id: "project-1", full_name: "Test Project 1", name: "TP1" },
						{ id: "project-2", full_name: "Test Project 2", name: "TP2" },
					],
				});
			}
			return Promise.resolve({ data: [] });
		},
	} as unknown as Session;
};

Deno.test("fetchProjects - should return active projects", async () => {
	const mockSession = createMockSession();
	const projects = await fetchProjects(mockSession);

	assertEquals(projects.length, 2);
	assertEquals(projects[0].name, "TP1");
	assertEquals(projects[1].name, "TP2");
});

Deno.test("displayProjectContext - should format global context", () => {
	const globalContext: ProjectContext = { project: null, isGlobal: true };
	const display = displayProjectContext(globalContext);

	assertEquals(display, "🌐 all projects, site-wide");
});

Deno.test("displayProjectContext - should format project context", () => {
	const projectContext: ProjectContext = {
		project: {
			id: "project-1",
			name: "Test Project",
			full_name: "Test Project Full",
		},
		isGlobal: false,
	};
	const display = displayProjectContext(projectContext);

	assertEquals(display, "📁 Test Project");
});

Deno.test("displayProjectContext - should handle null project", () => {
	const projectContext: ProjectContext = {
		project: null,
		isGlobal: false,
	};
	const display = displayProjectContext(projectContext);

	assertEquals(display, "📁 Unknown Project");
});
