import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { inspectTask } from "../tools/inspectTask.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";

// Mock data setup
const mockTaskData = {
  id: "task-1",
  name: "Animation",
  type: {
    name: "Animation",
    id: "type-1",
  },
  status: {
    name: "In Progress",
    id: "status-1",
  },
  priority: {
    name: "Medium",
    id: "priority-1",
  },
  parent: {
    name: "shot_010",
    id: "shot-1",
    type: { name: "Shot" },
  },
};

const mockTimelogsData = [{
  id: "timelog-1",
  user: { username: "artist1" },
  start: "2024-01-01T09:00:00",
  duration: 3600,
  comment: "Working on animation",
}];

const mockVersionsData = [{
  id: "version-1",
  version: 1,
  asset: { name: "main" },
  status: { name: "Approved" },
  date: "2024-01-01",
  is_published: true,
}];

// Mock services
const mockProjectContextService = {
  getContext: () => ({
    isGlobal: true,
    project: null
  })
} as unknown as ProjectContextService;

const mockQueryService = {
  queryTasks: () => Promise.resolve({ data: [mockTaskData] }),
  queryAssetVersions: () => Promise.resolve({ data: mockVersionsData })
} as unknown as QueryService;

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

Deno.test("inspectTask - should process task details with provided taskId", async () => {
  const originalConsoleLog = console.log;
  let logCalled = false;
  console.log = (..._args: unknown[]) => {
    logCalled = true;
  };

  const mockSession = createMockSession([mockTaskData, mockTimelogsData, mockVersionsData]);

  try {
    await inspectTask(mockSession, mockProjectContextService, mockQueryService, "task-1");

    // Verify that console.log was called (indicating the function ran successfully)
    assertEquals(logCalled, true, "Should have logged output");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("inspectTask - should handle errors properly", async () => {
  const originalConsoleError = console.error;
  const errorCalls: string[] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args.join(' '));
  };

  const mockSession = {
    query: () => Promise.reject(new Error("API Error")),
  } as unknown as Session;

  try {
    await assertRejects(
      async () => {
        await inspectTask(mockSession, mockProjectContextService, mockQueryService, "task-1");
      },
      Error,
      "API Error"
    );

    // Verify error was logged (should be for time logs, not task details)
    const errorLog = errorCalls.find(log => log.includes("Error during fetch task time logs"));
    assertEquals(errorLog !== undefined, true, "Should log error message");

  } finally {
    console.error = originalConsoleError;
  }
});
