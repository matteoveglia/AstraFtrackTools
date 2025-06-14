import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import inspectShot from "../tools/inspectShot.ts";

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
function createMockSession(queryResponses: any[]) {
  let queryCallCount = 0;
  return {
    query: () => {
      const response = queryResponses[queryCallCount];
      queryCallCount++;
      return Promise.resolve({ data: response });
    },
  } as unknown as Session;
}

Deno.test("inspectShot - should process shot details with provided shotId", async () => {
  const originalConsoleLog = console.log;
  let logCalled = false;
  console.log = (...args: any[]) => {
    logCalled = true;
  };

  const mockSession = createMockSession([mockShotData, mockTasksData, mockVersionsData]);

  try {
    await inspectShot(mockSession, "shot-1");

    // Verify that console.log was called (indicating the function ran successfully)
    assertEquals(logCalled, true, "Should have logged output");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("inspectShot - should handle errors properly", async () => {
  const originalConsoleError = console.error;
  const errorCalls: string[] = [];
  console.error = (...args: any[]) => {
    errorCalls.push(args.join(' '));
  };

  const mockSession = {
    query: () => Promise.reject(new Error("API Error")),
  } as unknown as Session;

  try {
    await assertRejects(
      async () => {
        await inspectShot(mockSession, "shot-1");
      },
      Error,
      "API Error"
    );

    // Verify error was logged
    const errorLog = errorCalls.find(log => log.includes("Error while fetching shot information"));
    assertEquals(errorLog !== undefined, true, "Should log error message");

  } finally {
    console.error = originalConsoleError;
  }
});
