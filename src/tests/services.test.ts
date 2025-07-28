import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { SessionService } from "../services/session.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";

// Mock session for testing
const createMockSession = () => {
  return {
    query: async (expression: string) => {
      if (expression.includes("error")) {
        throw new Error("Mock query error");
      }
      return { data: [{ id: "test-id", name: "test-name" }] };
    },
  } as unknown as Session;
};

Deno.test("SessionService - should execute queries successfully", async () => {
  const mockSession = createMockSession();
  const sessionService = new SessionService(mockSession);
  
  const result = await sessionService.query("select id, name from Project");
  assertEquals(result.data.length, 1);
  assertEquals(result.data[0].id, "test-id");
});

Deno.test("SessionService - should handle query errors", async () => {
  const mockSession = createMockSession();
  const sessionService = new SessionService(mockSession);
  
  await assertRejects(
    () => sessionService.query("select error from Project"),
    Error,
    "Query execution failed"
  );
});

Deno.test("ProjectContextService - should manage global context", () => {
  const globalContext = { project: null, isGlobal: true };
  const contextService = new ProjectContextService(globalContext);
  
  assertEquals(contextService.isGlobalMode(), true);
  assertEquals(contextService.getCurrentProjectId(), null);
});

Deno.test("ProjectContextService - should manage project context", () => {
  const projectContext = {
    project: { id: "project-1", name: "Test Project", full_name: "Test Project Full" },
    isGlobal: false
  };
  const contextService = new ProjectContextService(projectContext);
  
  assertEquals(contextService.isGlobalMode(), false);
  assertEquals(contextService.getCurrentProjectId(), "project-1");
});

Deno.test("ProjectContextService - should build project-scoped queries", () => {
  const projectContext = {
    project: { id: "project-1", name: "Test Project", full_name: "Test Project Full" },
    isGlobal: false
  };
  const contextService = new ProjectContextService(projectContext);
  
  const query = contextService.buildProjectScopedQuery("select id, name from Shot");
  assertEquals(query, 'select id, name from Shot where project.id is "project-1"');
});

Deno.test("ProjectContextService - should build global queries when in global mode", () => {
  const globalContext = { project: null, isGlobal: true };
  const contextService = new ProjectContextService(globalContext);
  
  const query = contextService.buildProjectScopedQuery("select id, name from Shot");
  assertEquals(query, "select id, name from Shot");
});

Deno.test("ProjectContextService - should handle ORDER BY clauses correctly", () => {
  const projectContext = {
    project: { id: "project-1", name: "Test Project", full_name: "Test Project Full" },
    isGlobal: false
  };
  const contextService = new ProjectContextService(projectContext);
  
  // Test ORDER BY clause
  const queryWithOrderBy = contextService.buildProjectScopedQuery(
    "select id, name from List order by name"
  );
  assertEquals(queryWithOrderBy, 'select id, name from List where project.id is "project-1" order by name');
  
  // Test multiple ORDER BY fields
  const queryWithMultipleOrderBy = contextService.buildProjectScopedQuery(
    "select id, name, category.name from List order by category.name, name"
  );
  assertEquals(queryWithMultipleOrderBy, 'select id, name, category.name from List where project.id is "project-1" order by category.name, name');
  
  // Test LIMIT clause
  const queryWithLimit = contextService.buildProjectScopedQuery(
    "select id, name from Shot limit 10"
  );
  assertEquals(queryWithLimit, 'select id, name from Shot where project.id is "project-1" limit 10');
  
  // Test ORDER BY with LIMIT
  const queryWithOrderByAndLimit = contextService.buildProjectScopedQuery(
    "select id, name from Shot order by name limit 10"
  );
  assertEquals(queryWithOrderByAndLimit, 'select id, name from Shot where project.id is "project-1" order by name limit 10');
});

Deno.test("QueryService - should execute project-scoped queries", async () => {
  const mockSession = createMockSession();
  const sessionService = new SessionService(mockSession);
  const projectContext = {
    project: { id: "project-1", name: "Test Project", full_name: "Test Project Full" },
    isGlobal: false
  };
  const contextService = new ProjectContextService(projectContext);
  const queryService = new QueryService(sessionService, contextService);
  
  const result = await queryService.queryShots();
  assertEquals(result.data.length, 1);
  assertEquals(result.data[0].id, "test-id");
});