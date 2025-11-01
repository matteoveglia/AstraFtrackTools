import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useStdin } from "ink";
import { Session } from "@ftrack/api";
import { SessionService } from "../services/session.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { SelectInput } from "./common/SelectInput.tsx";

// Import all tools
import { updateLatestVersionsSent } from "../tools/updateLatestVersions.ts";
import { exportSchema } from "../tools/exportSchema.ts";
import { inspectVersion } from "../tools/inspectVersion.ts";
import { inspectShot } from "../tools/inspectShot.ts";
import { inspectTask } from "../tools/inspectTask.ts";
import { inspectNote } from "../tools/inspectNote.ts";
import { propagateThumbnails } from "../tools/propagateThumbnails.ts";
import { downloadMediaTool } from "../tools/downloadMediaTool.ts";
import { deleteMediaTool } from "../tools/deleteMediaTool.ts";
import { manageLists } from "../tools/manageLists.ts";

interface ToolRunnerProps {
  toolValue: string;
  session: Session;
  sessionService: SessionService;
  projectContextService: ProjectContextService;
  queryService: QueryService;
  onComplete: () => void;
  onExit: () => void;
}

type ExportFormat = "json" | "yaml" | "csv" | "ts";

export const ToolRunner: React.FC<ToolRunnerProps> = ({
  toolValue,
  session,
  sessionService,
  projectContextService,
  queryService,
  onComplete,
  onExit,
}) => {
  const [status, setStatus] = useState<"running" | "completed" | "error">(
    "running"
  );
  const [message, setMessage] = useState<string>("");
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    runTool();
  }, []);

  const runTool = async () => {
    try {
      setStatus("running");

      // Temporarily disable raw mode to allow tools to use their own prompts
      // This allows Cliffy prompts to work while Ink is running
      if (setRawMode) {
        setRawMode(false);
      }

      // Parse tool value (handle submenu tools like "exportSchema:json")
      const [toolName, subOption] = toolValue.split(":");

      switch (toolName) {
        case "updateVersions":
          await updateLatestVersionsSent(
            session,
            projectContextService,
            queryService
          );
          setMessage("Latest versions updated successfully!");
          break;

        case "exportSchema":
          if (subOption) {
            const result = await exportSchema(
              session,
              projectContextService,
              subOption as ExportFormat
            );
            if (typeof result === "object" && result !== null) {
              const exportResult = result as { filename: string };
              if ("filename" in exportResult) {
                setMessage(
                  `Schema exported successfully to ${exportResult.filename}`
                );
              } else {
                setMessage("Schema export completed");
              }
            } else {
              setMessage("Schema export completed");
            }
          }
          break;

        case "inspectVersion":
          await inspectVersion(session, projectContextService, queryService);
          setMessage("Version inspection completed!");
          break;

        case "inspectShot":
          await inspectShot(session, projectContextService, queryService);
          setMessage("Shot inspection completed!");
          break;

        case "inspectTask":
          await inspectTask(session, projectContextService, queryService);
          setMessage("Task inspection completed!");
          break;

        case "inspectNote":
          await inspectNote(session, projectContextService, queryService);
          setMessage("Note inspection completed!");
          break;

        case "manageLists":
          await manageLists(session, projectContextService);
          setMessage("List management completed!");
          break;

        case "downloadMedia":
          await downloadMediaTool(session, projectContextService, queryService);
          setMessage("Media download completed!");
          break;

        case "deleteMedia":
          await deleteMediaTool(session, projectContextService, queryService);
          setMessage("Media deletion completed!");
          break;

        case "propagateThumbnails":
          await propagateThumbnails(
            session,
            projectContextService,
            queryService
          );
          setMessage("Thumbnail propagation completed!");
          break;

        default:
          setMessage(`Unknown tool: ${toolName}`);
      }

      setStatus("completed");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      // Re-enable raw mode for Ink after tool completes
      if (setRawMode) {
        setRawMode(true);
      }
    }
  };

  const handleContinue = (choice: string) => {
    if (choice === "menu") {
      onComplete();
    } else {
      onExit();
    }
  };

  if (status === "running") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Running Tool
        </Text>
        <Text>{"\n"}Please wait...</Text>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Error
        </Text>
        <Text>
          {"\n"}
          {message}
          {"\n"}
        </Text>
        <SelectInput
          items={[
            { label: "Return to menu", value: "menu" },
            { label: "Exit", value: "exit" },
          ]}
          onSelect={handleContinue}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        Tool Completed
      </Text>
      <Text>
        {"\n"}
        {message}
        {"\n"}
      </Text>
      <SelectInput
        items={[
          { label: "Return to menu", value: "menu" },
          { label: "Exit", value: "exit" },
        ]}
        onSelect={handleContinue}
      />
    </Box>
  );
};
