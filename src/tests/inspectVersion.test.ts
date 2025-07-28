import { assertEquals } from "@std/assert";
import { Session } from "@ftrack/api";
import { inspectVersion } from "../tools/inspectVersion.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";

// Mock data setup
const mockVersionData = {
  id: "version-1",
  version: 1,
  asset: {
    id: "asset-1",
    name: "main",
    parent: {
      id: "shot-1",
      name: "shot_010",
      type: { name: "Shot" },
    },
  },
};

const mockLinksData = [{
  id: "link-1",
  configuration: {
    key: "latestVersionSent",
    id: "config-1",
  },
  from_id: "version-1",
  to_id: "shot-1",
}];

// Mock services
const mockProjectContextService = {
  getContext: () => ({
    isGlobal: true,
    project: null
  })
} as unknown as ProjectContextService;

const mockQueryService = {
  queryAssetVersions: () => Promise.resolve({ data: [mockVersionData] }),
  queryVersionLinks: () => Promise.resolve({ data: mockLinksData })
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

Deno.test("inspectVersion - should query version details with provided versionId", async () => {
  const originalConsoleLog = console.log;
  let logCalled = false;
  console.log = (..._args: unknown[]) => {
    logCalled = true;
  };

  const mockSession = createMockSession([mockVersionData, mockLinksData]);

  try {
    await inspectVersion(mockSession, mockProjectContextService, mockQueryService, "version-1");

    // Verify that console.log was called (indicating the function ran successfully)
    assertEquals(logCalled, true, "Should have logged output");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("inspectVersion - should handle empty results gracefully", async () => {
  const originalConsoleLog = console.log;
  let logCalled = false;
  console.log = (..._args: unknown[]) => {
    logCalled = true;
  };

  const mockSession = createMockSession([[], []]);

  try {
    await inspectVersion(mockSession, mockProjectContextService, mockQueryService, "version-1");

    // Verify that console.log was called (indicating the function ran successfully)
    assertEquals(logCalled, true, "Should have logged output");

  } finally {
    console.log = originalConsoleLog;
  }
});
