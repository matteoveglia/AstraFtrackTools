import { assertEquals, assertRejects } from "@std/assert";
import type { Session } from "@ftrack/api";
import { updateLatestVersionsSent } from "../tools/updateLatestVersions.ts";
import { debug, setDebugLogger } from "../utils/debug.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";
import { Select } from "@cliffy/prompt";
// Helper to stub Select.prompt for non-interactive tests
function stubSelectPrompt() {
  (Select as unknown as {
    prompt: (opts: { message?: string }) => Promise<string>;
  }).prompt = (_opts: { message?: string }) => {
    const message: string = _opts?.message ?? "";
    if (message.includes("update mode")) return Promise.resolve("new");
    if (message.includes("proceed with these")) {
      return Promise.resolve("cancel");
    }
    if (message.includes("force update mode")) {
      return Promise.resolve("continue");
    }
    return Promise.resolve("no");
  };
}

// Mock services
const createMockProjectContextService = () => ({
  getContext: () => ({
    isGlobal: true,
    project: null,
  }),
  buildProjectScopedQuery: (query: string) => query,
});

const createMockQueryService = () => ({
  queryShots: () =>
    Promise.resolve({
      data: [{
        id: "shot-1",
        name: "shot_010",
        parent: { name: "seq_010" },
      }],
    }),
});

// Mock debug logger
const originalDebug = debug;
let debugCalls: string[] = [];

function mockDebug(...args: unknown[]) {
  debugCalls.push(args.map(String).join(" "));
}

function resetMocks() {
  debugCalls = [];
  setDebugLogger(mockDebug);
}

function restoreMocks() {
  setDebugLogger(originalDebug);
}

Deno.test("updateLatestVersionsSent should be defined", () => {
  assertEquals(typeof updateLatestVersionsSent, "function");
});

Deno.test("updateLatestVersionsSent should process shots and their versions", async () => {
  resetMocks();
  stubSelectPrompt();
  (Deno as unknown as { isatty?: (rid: number) => boolean }).isatty = () =>
    false;

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
        case 1:
          return Promise.resolve({ data: [mockConfigs.link] });
        case 2:
          return Promise.resolve({ data: [mockConfigs.date] });
        case 3:
          return Promise.resolve({ data: [mockVersion] });
        case 4:
          return Promise.resolve({
            data: [{ id: "link-1", to_id: "old-version" }],
          });
        case 5:
          return Promise.resolve({ data: [] });
        default:
          return Promise.resolve({ data: [] });
      }
    },
    update: () => Promise.resolve(undefined),
    call: () => Promise.resolve(undefined),
  } as unknown as Session;

  const mockProjectContextService =
    createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  // Mock Select.prompt to provide non-interactive responses
  // This mock avoids hanging in test environment by returning default values
  (globalThis as unknown as {
    Select: {
      prompt: (
        options: {
          message: string;
          options?: Array<{ name: string; value: string }>;
        },
      ) => Promise<string>;
    };
  }).Select = {
    prompt: (options) => {
      // Return first option value or a safe default based on the message
      if (options.message.includes("update mode")) {
        return Promise.resolve("new");
      } else if (options.message.includes("proceed with these")) {
        return Promise.resolve("cancel");
      } else if (options.message.includes("Update ")) {
        return Promise.resolve("no");
      } else if (options.message.includes("force update mode")) {
        return Promise.resolve("continue");
      } else {
        // Default fallback for any other prompts
        return Promise.resolve(options.options?.[0]?.value || "cancel");
      }
    },
  };

  await updateLatestVersionsSent(
    mockSession,
    mockProjectContextService,
    mockQueryService,
  );

  assertEquals(queryCallCount >= 1, true);
  assertEquals(debugCalls.length > 0, true);

  restoreMocks();
});

Deno.test("updateLatestVersionsSent should handle missing configurations", async () => {
  resetMocks();

  const mockSession = {
    query: () => Promise.resolve({ data: [] }), // No configs
  } as unknown as Session;

  const mockProjectContextService =
    createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  await assertRejects(
    () =>
      updateLatestVersionsSent(
        mockSession,
        mockProjectContextService,
        mockQueryService,
      ),
    Error,
    "Could not find necessary configurations",
  );

  restoreMocks();
});

Deno.test("updateLatestVersionsSent should skip shots with no delivered versions", async () => {
  resetMocks();
  stubSelectPrompt();
  (Deno as unknown as { isatty?: (rid: number) => boolean }).isatty = () =>
    false;

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
        case 1:
          return Promise.resolve({ data: [mockConfigs.link] });
        case 2:
          return Promise.resolve({ data: [mockConfigs.date] });
        case 3:
          return Promise.resolve({ data: [] }); // No versions
        case 4:
          return Promise.resolve({ data: [] }); // No current link
        case 5:
          return Promise.resolve({ data: [] }); // No dates
        default:
          return Promise.resolve({ data: [] });
      }
    },
    update: () => {
      updateCalled = true;
      return Promise.resolve(undefined);
    },
    call: () => Promise.resolve(undefined),
  } as unknown as Session;

  const mockProjectContextService =
    createMockProjectContextService() as unknown as ProjectContextService;
  const mockQueryService = createMockQueryService() as unknown as QueryService;

  // Mock Select.prompt for non-interactive environment
  (globalThis as unknown as {
    Select: {
      prompt: (
        options: {
          message: string;
          options?: Array<{ name: string; value: string }>;
        },
      ) => Promise<string>;
    };
  }).Select = {
    prompt: (options) => {
      if (options.message.includes("update mode")) {
        return Promise.resolve("new");
      } else if (options.message.includes("proceed with these")) {
        return Promise.resolve("cancel");
      } else if (options.message.includes("Update ")) {
        return Promise.resolve("no");
      } else if (options.message.includes("force update mode")) {
        return Promise.resolve("continue");
      }
      return Promise.resolve(options.options?.[0]?.value || "cancel");
    },
  };

  await updateLatestVersionsSent(
    mockSession,
    mockProjectContextService,
    mockQueryService,
  );

  assertEquals(updateCalled, false);
  assertEquals(
    debugCalls.some((call) => call.includes("Found 0 delivered versions")),
    true,
  );

  restoreMocks();
});
