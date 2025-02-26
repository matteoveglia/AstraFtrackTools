import { beforeEach, describe, expect, it, vi } from "vitest";
import { Session } from "@ftrack/api";
import inspectTask from "../tools/inspectTask.js";
import inquirer from "inquirer";
import * as debugModule from "../utils/debug.js";

vi.mock("inquirer");
vi.mock("../utils/debug.js", () => ({
  debug: vi.fn(),
  isDebugMode: vi.fn().mockReturnValue(true),
}));

describe("inspectTask", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process task details with provided taskId", async () => {
    const mockSession = {
      query: vi.fn()
        .mockResolvedValueOnce({ data: [mockTaskData] })
        .mockResolvedValueOnce({ data: mockTimelogsData })
        .mockResolvedValueOnce({ data: mockVersionsData }),
    } as unknown as Session;

    console.log = vi.fn();

    await inspectTask(mockSession, "task-1");

    expect(mockSession.query).toHaveBeenCalledTimes(3);
    expect(mockSession.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("task-1"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("TASK DETAILS"),
    );
    expect(debugModule.debug).toHaveBeenCalled();
  });

  it("should prompt for task ID when none provided", async () => {
    const mockSession = {
      query: vi.fn()
        .mockResolvedValueOnce({ data: [mockTaskData] })
        .mockResolvedValueOnce({ data: mockTimelogsData })
        .mockResolvedValueOnce({ data: mockVersionsData }),
    } as unknown as Session;

    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ taskId: "task-1" });
    console.log = vi.fn();

    await inspectTask(mockSession);

    expect(inquirer.prompt).toHaveBeenCalledWith(expect.objectContaining({
      type: "input",
      name: "taskId",
    }));
    expect(mockSession.query).toHaveBeenCalledTimes(3);
    expect(debugModule.debug).toHaveBeenCalled();
  });

  it("should handle empty results gracefully", async () => {
    const mockSession = {
      query: vi.fn()
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] }),
    } as unknown as Session;

    console.log = vi.fn();

    await inspectTask(mockSession, "task-1");

    expect(mockSession.query).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("TASK DETAILS"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("TIME LOGS"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("VERSIONS"),
    );
  });
});
