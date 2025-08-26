import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { inspectShot } from "../tools/inspectShot.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";

// Mock data setup
const mockShotData = {
  id: "shot-1",
  name: "shot_010",
  parent: {
    id: "seq-1",
    name: "seq_010",
    type: { name: "Sequence" },
  },
  project: {
    id: "proj-1",
    name: "Project 1",
  },
  status: {
    name: "Active",
    id: "status-1",
  },
};

const mockTasksData = [{
  id: "task-1",
  name: "Animation",
  type: { name: "Animation" },
  status: { name: "In Progress" },
  priority: { name: "Medium" },
}];

const mockVersionsData = [{
  id: "version-1",
  version: 1,
  asset: { name: "main" },
  status: { name: "Approved" },
  date: "2024-01-01",
  is_published: true,
}];

// Mock session factory
function createMockSession(queryResponses: unknown[]) {
  let queryCallCount = 0;
  return {
    query: () => {
      const response = queryResponses[queryCallCount];
      queryCallCount++;
      return Promise.resolve({ data: response });
    },
  } as unknown as Session;
}

// Mock services
const mockProjectContextService = {
  getContext: () => ({
    isGlobal: true,
    project: null,
  }),
} as unknown as ProjectContextService;

const mockQueryService = {
  queryShots: () => Promise.resolve({ data: [mockShotData] }),
  queryTasks: () => Promise.resolve({ data: mockTasksData }),
  queryAssetVersions: () => Promise.resolve({ data: mockVersionsData }),
} as unknown as QueryService;

Deno.test("inspectShot - should process shot details with provided shotId", async () => {
  const originalConsoleLog = console.log;
  let logCalled = false;
  console.log = (..._args: unknown[]) => {
    logCalled = true;
  };

  const mockSession = createMockSession([
    mockShotData,
    mockTasksData,
    mockVersionsData,
  ]);

  try {
    await inspectShot(
      mockSession,
      mockProjectContextService,
      mockQueryService,
      "shot-1",
    );

    // Verify that console.log was called (indicating the function ran successfully)
    assertEquals(logCalled, true, "Should have logged output");
  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("inspectShot - should handle errors properly", async () => {
  const originalConsoleError = console.error;
  const errorCalls: string[] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args.join(" "));
  };

  const mockSession = {
    query: () => Promise.reject(new Error("API Error")),
  } as unknown as Session;

  const mockFailingQueryService = {
    queryShots: () => Promise.reject(new Error("API Error")),
    queryTasks: () => Promise.reject(new Error("API Error")),
    queryAssetVersions: () => Promise.reject(new Error("API Error")),
  } as unknown as QueryService;

  try {
    await assertRejects(
      async () => {
        await inspectShot(
          mockSession,
          mockProjectContextService,
          mockFailingQueryService,
          "shot-1",
        );
      },
      Error,
      "API Error",
    );

    // Verify error was logged
    const errorLog = errorCalls.find((log) =>
      log.includes("Error during fetch shot details")
    );
    assertEquals(errorLog !== undefined, true, "Should log error message");
  } finally {
    console.error = originalConsoleError;
  }
});
