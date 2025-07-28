import { assertEquals, assertRejects } from "@std/assert";
import type { Session } from "@ftrack/api";
import { updateLatestVersionsSent } from "../tools/updateLatestVersions.ts";
import * as debugModule from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";

// Mock services
const createMockProjectContextService = () => ({
  getContext: () => ({
    isGlobal: true,
    project: null
  }),
  buildProjectScopedQuery: (query: string) => query
});

const createMockQueryService = () => ({
  queryShots: () => Promise.resolve({
    data: [{
      id: "shot-1",
      name: "shot_010",
      parent: { name: "seq_010" }
    }]
  })
});

// Mock debug module
const originalDebug = debugModule.debug;
let debugCalls: string[] = [];

function mockDebug(message: string) {
  debugCalls.push(message);
}

function resetMocks() {
  debugCalls = [];
  (debugModule as unknown as { debug: typeof mockDebug }).debug = mockDebug;
}

function restoreMocks() {
  (debugModule as unknown as { debug: typeof originalDebug }).debug = originalDebug;
}

Deno.test("updateLatestVersionsSent should be defined", () => {
  assertEquals(typeof updateLatestVersionsSent, "function");
});

Deno.test("updateLatestVersionsSent should process shots and their versions", async () => {
  resetMocks();
  
  const mockConfigs = {
    link: { id: "config-1", key: "latestVersionSent" },
    date: { id: "date-config-1", key: "latestVersionSentDate" },
  };

  const mockVersion = {
    id: "version-1",
    version: 1,
    asset: { name: "main", parent: { id: "shot-1" } },
    date: "2023-12-25T12:00:00.000Z",
    is_published: true,
    custom_attributes: [{ key: "delivered", value: true }],
  };

  let queryCallCount = 0;
  const mockSession = {
    query: () => {
      queryCallCount++;
      switch (queryCallCount) {
        case 1: return Promise.resolve({ data: [mockConfigs.link] });
        case 2: return Promise.resolve({ data: [mockConfigs.date] });
        case 3: return Promise.resolve({ data: [mockVersion] });
        case 4: return Promise.resolve({ data: [{ id: "link-1", to_id: "old-version" }] });
        case 5: return Promise.resolve({ data: [] });
        default: return Promise.resolve({ data: [] });
      }
    },
    update: () => Promise.resolve(undefined),
    call: () => Promise.resolve(undefined),
  } as unknown as Session;

  const mockProjectContextService = createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  // Mock readline to return "no"
   (globalThis as unknown as { readline: { createInterface: () => { question: (prompt: string) => Promise<string>; close: () => void } } }).readline = {
     createInterface: () => ({
       question: (_prompt: string) => Promise.resolve("no"),
       close: () => {},
     }),
   };

  await updateLatestVersionsSent(mockSession, mockProjectContextService, mockQueryService);

  assertEquals(queryCallCount >= 1, true);
  assertEquals(debugCalls.length > 0, true);
  
  restoreMocks();
});

Deno.test("updateLatestVersionsSent should handle missing configurations", async () => {
  resetMocks();
  
  const mockSession = {
    query: () => Promise.resolve({ data: [] }), // No configs
  } as unknown as Session;

  const mockProjectContextService = createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  await assertRejects(
    () => updateLatestVersionsSent(mockSession, mockProjectContextService, mockQueryService),
    Error,
    "Could not find necessary configurations"
  );
  
  restoreMocks();
});

Deno.test("updateLatestVersionsSent should skip shots with no delivered versions", async () => {
  resetMocks();
  
  const mockConfigs = {
    link: { id: "config-1", key: "latestVersionSent" },
    date: { id: "date-config-1", key: "latestVersionSentDate" },
  };

  let queryCallCount = 0;
  let updateCalled = false;
  
  const mockSession = {
    query: () => {
      queryCallCount++;
      switch (queryCallCount) {
        case 1: return Promise.resolve({ data: [mockConfigs.link] });
        case 2: return Promise.resolve({ data: [mockConfigs.date] });
        case 3: return Promise.resolve({ data: [] }); // No versions
        case 4: return Promise.resolve({ data: [] }); // No current link
        case 5: return Promise.resolve({ data: [] }); // No dates
        default: return Promise.resolve({ data: [] });
      }
    },
    update: () => {
      updateCalled = true;
      return Promise.resolve(undefined);
    },
    call: () => Promise.resolve(undefined),
  } as unknown as Session;

  const mockProjectContextService = createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  // Mock readline to return "no"
  (globalThis as unknown as { readline: { createInterface: () => { question: (prompt: string) => Promise<string>; close: () => void } } }).readline = {
    createInterface: () => ({
      question: (_prompt: string) => Promise.resolve("no"),
      close: () => {},
    }),
  };

  await updateLatestVersionsSent(mockSession, mockProjectContextService, mockQueryService);

  assertEquals(updateCalled, false);
  assertEquals(debugCalls.some(call => call.includes("Found 0 delivered versions")), true);
  
  restoreMocks();
});
