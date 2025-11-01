import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { SelectInput } from "./common/SelectInput.tsx";
import { loadPreferences, savePreferences } from "../utils/preferences.ts";
import { Session } from "@ftrack/api";

interface SettingsProps {
  onBack: () => void;
  onCredentialsUpdated?: (server: string, user: string, key: string) => void;
}

type SettingsView = "menu" | "view-creds" | "edit-server" | "edit-user" | "edit-key" | "confirm" | "testing" | "success";

export const Settings: React.FC<SettingsProps> = ({ onBack, onCredentialsUpdated }) => {
  const [view, setView] = useState<SettingsView>("menu");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [key, setKey] = useState("");
  const [newServer, setNewServer] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentCredentials();
  }, []);

  const loadCurrentCredentials = async () => {
    try {
      setLoading(true);
      const prefs = await loadPreferences();
      setServer(prefs.FTRACK_SERVER || "");
      setUser(prefs.FTRACK_API_USER || "");
      setKey(prefs.FTRACK_API_KEY || "");
      setNewServer(prefs.FTRACK_SERVER || "");
      setNewUser(prefs.FTRACK_API_USER || "");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const testCredentials = async (
    testServer: string,
    testUser: string,
    testKey: string
  ): Promise<boolean> => {
    try {
      const testSession = new Session(testServer, testUser, testKey, {
        autoConnectEventHub: false,
      });
      await testSession.initializing;
      return true;
    } catch (err: unknown) {
      const error = err as { errorCode?: string };
      if (error?.errorCode === "api_credentials_invalid") {
        setError("Invalid API credentials");
        return false;
      }
      setError(err instanceof Error ? err.message : "Connection failed");
      return false;
    }
  };

  const handleMenuSelection = (value: string) => {
    setError(null);
    switch (value) {
      case "view":
        setView("view-creds");
        break;
      case "edit":
        setView("edit-server");
        break;
      case "back":
        onBack();
        break;
    }
  };

  const handleViewCredsAction = (value: string) => {
    if (value === "edit") {
      setView("edit-server");
    } else {
      setView("menu");
    }
  };

  const handleServerSubmit = (value: string) => {
    setNewServer(value);
    setView("edit-user");
  };

  const handleUserSubmit = (value: string) => {
    setNewUser(value);
    setView("edit-key");
  };

  const handleKeySubmit = (value: string) => {
    setNewKey(value);
    setView("confirm");
  };

  const handleConfirm = async (choice: string) => {
    if (choice === "save-test") {
      setView("testing");
      const isValid = await testCredentials(newServer, newUser, newKey);
      if (isValid) {
        await savePreferences({
          FTRACK_SERVER: newServer,
          FTRACK_API_USER: newUser,
          FTRACK_API_KEY: newKey,
        });
        setServer(newServer);
        setUser(newUser);
        setKey(newKey);
        setView("success");
      } else {
        setView("edit-server");
      }
    } else if (choice === "save-skip") {
      await savePreferences({
        FTRACK_SERVER: newServer,
        FTRACK_API_USER: newUser,
        FTRACK_API_KEY: newKey,
      });
      setServer(newServer);
      setUser(newUser);
      setKey(newKey);
      setView("success");
    } else {
      setView("edit-server");
    }
  };

  const handleSuccess = (choice: string) => {
    if (choice === "restart") {
      // Notify parent to restart with new credentials
      if (onCredentialsUpdated) {
        onCredentialsUpdated(server, user, key);
      }
    } else {
      setView("menu");
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Settings
        </Text>
        <Text>{"\n"}Loading...</Text>
      </Box>
    );
  }

  if (view === "menu") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Settings
        </Text>
        <Text>{"\n"}Select an option:{"\n"}</Text>
        <SelectInput
          items={[
            { label: "View Current Credentials", value: "view" },
            { label: "Edit Credentials", value: "edit" },
            { label: "", value: "sep", disabled: true },
            { label: "← Back to Main Menu", value: "back" },
          ]}
          onSelect={handleMenuSelection}
        />
      </Box>
    );
  }

  if (view === "view-creds") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Current Credentials
        </Text>
        <Text>{"\n"}</Text>
        <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
          <Text>
            <Text color="yellow">Server:</Text> {server}
          </Text>
          <Text>
            <Text color="yellow">API User:</Text> {user}
          </Text>
          <Text>
            <Text color="yellow">API Key:</Text> {"•".repeat(Math.min(key.length, 32))}
          </Text>
        </Box>
        <Text>{"\n"}</Text>
        <SelectInput
          items={[
            { label: "Edit Credentials", value: "edit" },
            { label: "← Back", value: "back" },
          ]}
          onSelect={handleViewCredsAction}
        />
      </Box>
    );
  }

  if (view === "edit-server") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Edit Credentials
        </Text>
        {error && (
          <Text color="red">
            {"\n"}
            {error}
            {"\n"}
          </Text>
        )}
        <Text>{"\n"}Current: {server}</Text>
        <Text>New Ftrack Server URL: </Text>
        <TextInput value={newServer} onChange={setNewServer} onSubmit={handleServerSubmit} />
      </Box>
    );
  }

  if (view === "edit-user") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Edit Credentials
        </Text>
        <Text>Server: {newServer}</Text>
        <Text>{"\n"}Current: {user}</Text>
        <Text>New API User: </Text>
        <TextInput value={newUser} onChange={setNewUser} onSubmit={handleUserSubmit} />
      </Box>
    );
  }

  if (view === "edit-key") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Edit Credentials
        </Text>
        <Text>Server: {newServer}</Text>
        <Text>User: {newUser}</Text>
        <Text>{"\n"}New API Key: </Text>
        <TextInput value={newKey} onChange={setNewKey} onSubmit={handleKeySubmit} mask="*" />
      </Box>
    );
  }

  if (view === "confirm") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Confirm Changes
        </Text>
        <Text>{"\n"}</Text>
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <Text>
            <Text color="yellow">Server:</Text> {newServer}
          </Text>
          <Text>
            <Text color="yellow">User:</Text> {newUser}
          </Text>
          <Text>
            <Text color="yellow">API Key:</Text> {"•".repeat(Math.min(newKey.length, 32))}
          </Text>
        </Box>
        <Text>{"\n"}Would you like to test these credentials before saving?{"\n"}</Text>
        <SelectInput
          items={[
            { label: "Save and Test", value: "save-test" },
            { label: "Save without Testing", value: "save-skip" },
            { label: "Cancel", value: "cancel" },
          ]}
          onSelect={handleConfirm}
        />
      </Box>
    );
  }

  if (view === "testing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>
          Testing Credentials
        </Text>
        <Text>{"\n"}Connecting to Ftrack...</Text>
      </Box>
    );
  }

  if (view === "success") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          ✓ Credentials Updated
        </Text>
        <Text>{"\n"}Your credentials have been saved successfully.</Text>
        <Text>{"\n"}Note: To use the new credentials, you'll need to restart the application.{"\n"}</Text>
        <SelectInput
          items={[
            { label: "Restart Application", value: "restart" },
            { label: "← Back to Settings", value: "back" },
          ]}
          onSelect={handleSuccess}
        />
      </Box>
    );
  }

  return null;
};
