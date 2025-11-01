import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Session } from "@ftrack/api";
import { CredentialsSetup } from "./CredentialsSetup.tsx";
import { ProjectSelector } from "./ProjectSelector.tsx";
import { MainMenu } from "./MainMenu.tsx";
import { loadPreferences } from "../utils/preferences.ts";
import { SessionService } from "../services/session.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { type ProjectContext } from "../utils/projectSelection.ts";

type AppState =
  | "loading"
  | "credentials-setup"
  | "project-selection"
  | "main-menu"
  | "error";

interface AppProps {
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({ onExit }) => {
  const [state, setState] = useState<AppState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(
    null
  );
  const [sessionService, setSessionService] = useState<SessionService | null>(
    null
  );
  const [projectContextService, setProjectContextService] = useState<
    ProjectContextService | null
  >(null);
  const [queryService, setQueryService] = useState<QueryService | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial setup - check for credentials
  useEffect(() => {
    checkCredentials();
  }, []);

  const checkCredentials = async () => {
    try {
      const prefs = await loadPreferences();

      if (
        !prefs.FTRACK_SERVER ||
        !prefs.FTRACK_API_USER ||
        !prefs.FTRACK_API_KEY
      ) {
        setState("credentials-setup");
      } else {
        await initializeSession(
          prefs.FTRACK_SERVER,
          prefs.FTRACK_API_USER,
          prefs.FTRACK_API_KEY
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const initializeSession = async (
    server: string,
    user: string,
    key: string
  ) => {
    try {
      setState("loading");
      const newSession = new Session(server, user, key, {
        autoConnectEventHub: false,
      });
      await newSession.initializing;

      setSession(newSession);
      setSessionService(new SessionService(newSession));
      setState("project-selection");
    } catch (err: unknown) {
      const error = err as { errorCode?: string };
      if (error?.errorCode === "api_credentials_invalid") {
        setState("credentials-setup");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    }
  };

  const handleCredentialsComplete = async (
    server: string,
    user: string,
    key: string
  ) => {
    await initializeSession(server, user, key);
  };

  const handleProjectSelected = (context: ProjectContext) => {
    if (!session || !sessionService) return;

    setProjectContext(context);
    const pcs = new ProjectContextService(context);
    const qs = new QueryService(sessionService, pcs);
    setProjectContextService(pcs);
    setQueryService(qs);
    setState("main-menu");
  };

  const handleChangeProject = () => {
    setState("project-selection");
  };

  const handleCredentialsUpdated = async (
    server: string,
    user: string,
    key: string
  ) => {
    // Restart the entire session with new credentials
    await initializeSession(server, user, key);
  };

  const handleExit = () => {
    if (onExit) {
      onExit();
    }
  };

  if (state === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Astra Ftrack Tools
        </Text>
        <Text>Initializing...</Text>
      </Box>
    );
  }

  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Error
        </Text>
        <Text>{error}</Text>
      </Box>
    );
  }

  if (state === "credentials-setup") {
    return (
      <CredentialsSetup
        onComplete={handleCredentialsComplete}
        onExit={handleExit}
      />
    );
  }

  if (state === "project-selection" && session && sessionService) {
    return (
      <ProjectSelector
        session={session}
        onProjectSelected={handleProjectSelected}
        onExit={handleExit}
      />
    );
  }

  if (
    state === "main-menu" &&
    session &&
    projectContext &&
    sessionService &&
    projectContextService &&
    queryService
  ) {
    return (
      <MainMenu
        session={session}
        projectContext={projectContext}
        sessionService={sessionService}
        projectContextService={projectContextService}
        queryService={queryService}
        onChangeProject={handleChangeProject}
        onCredentialsUpdated={handleCredentialsUpdated}
        onExit={handleExit}
      />
    );
  }

  return (
    <Box>
      <Text>Unknown state</Text>
    </Box>
  );
};
