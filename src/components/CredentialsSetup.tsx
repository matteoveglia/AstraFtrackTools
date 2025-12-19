import type React from "react";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { Session } from "@ftrack/api";
import { savePreferences } from "../utils/preferences.ts";
import { SelectInput } from "./common/SelectInput.tsx";

interface CredentialsSetupProps {
	onComplete: (server: string, user: string, key: string) => void;
	onExit: () => void;
}

type SetupStep = "welcome" | "server" | "user" | "key" | "confirm" | "testing";

export const CredentialsSetup: React.FC<CredentialsSetupProps> = ({
	onComplete,
	onExit,
}) => {
	const [step, setStep] = useState<SetupStep>("welcome");
	const [server, setServer] = useState("");
	const [user, setUser] = useState("");
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleWelcomeChoice = (choice: string) => {
		if (choice === "setup") {
			setStep("server");
		} else {
			onExit();
		}
	};

	const handleServerSubmit = (value: string) => {
		setServer(value);
		setStep("user");
	};

	const handleUserSubmit = (value: string) => {
		setUser(value);
		setStep("key");
	};

	const handleKeySubmit = (value: string) => {
		setKey(value);
		setStep("confirm");
	};

	const handleConfirm = async (choice: string) => {
		if (choice === "test") {
			setStep("testing");
			const isValid = await testCredentials(server, user, key);
			if (isValid) {
				await savePreferences({
					FTRACK_SERVER: server,
					FTRACK_API_USER: user,
					FTRACK_API_KEY: key,
				});
				onComplete(server, user, key);
			} else {
				setError("Invalid credentials. Please try again.");
				setStep("server");
			}
		} else if (choice === "skip") {
			await savePreferences({
				FTRACK_SERVER: server,
				FTRACK_API_USER: user,
				FTRACK_API_KEY: key,
			});
			onComplete(server, user, key);
		} else {
			setStep("server");
		}
	};

	const testCredentials = async (
		server: string,
		user: string,
		key: string,
	): Promise<boolean> => {
		try {
			const testSession = new Session(server, user, key, {
				autoConnectEventHub: false,
			});
			await testSession.initializing;
			return true;
		} catch (err: unknown) {
			const error = err as { errorCode?: string };
			if (error?.errorCode === "api_credentials_invalid") {
				return false;
			}
			return false;
		}
	};

	if (step === "welcome") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Welcome to Astra Ftrack Tools!
				</Text>
				<Text>
					{"\n"}First-time setup required. Let's configure your Ftrack
					credentials.{"\n"}
				</Text>
				<SelectInput
					items={[
						{ label: "Continue with setup", value: "setup" },
						{ label: "Exit", value: "exit" },
					]}
					onSelect={handleWelcomeChoice}
				/>
			</Box>
		);
	}

	if (step === "server") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Ftrack Credentials Setup
				</Text>
				{error && (
					<Text color="red">
						{"\n"}
						{error}
						{"\n"}
					</Text>
				)}
				<Text>{"\n"}Ftrack Server URL: </Text>
				<TextInput
					value={server}
					onChange={setServer}
					onSubmit={handleServerSubmit}
				/>
			</Box>
		);
	}

	if (step === "user") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Ftrack Credentials Setup
				</Text>
				<Text>Server: {server}</Text>
				<Text>{"\n"}API User: </Text>
				<TextInput
					value={user}
					onChange={setUser}
					onSubmit={handleUserSubmit}
				/>
			</Box>
		);
	}

	if (step === "key") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Ftrack Credentials Setup
				</Text>
				<Text>Server: {server}</Text>
				<Text>User: {user}</Text>
				<Text>{"\n"}API Key: </Text>
				<TextInput
					value={key}
					onChange={setKey}
					onSubmit={handleKeySubmit}
					mask="*"
				/>
			</Box>
		);
	}

	if (step === "confirm") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Confirm Credentials
				</Text>
				<Text>
					{"\n"}Server: {server}
				</Text>
				<Text>User: {user}</Text>
				<Text>API Key: {"*".repeat(key.length)}</Text>
				<Text>
					{"\n"}Would you like to test these credentials?{"\n"}
				</Text>
				<SelectInput
					items={[
						{ label: "Test credentials", value: "test" },
						{ label: "Skip test and save", value: "skip" },
						{ label: "Start over", value: "restart" },
					]}
					onSelect={handleConfirm}
				/>
			</Box>
		);
	}

	if (step === "testing") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Testing Credentials
				</Text>
				<Text>{"\n"}Connecting to Ftrack...</Text>
			</Box>
		);
	}

	return null;
};
