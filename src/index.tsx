#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-net --allow-sys
import React from "react";
import { render } from "ink";
import { App } from "./components/App.tsx";

// Declare Deno global for TypeScript
declare const Deno: {
	exit(code?: number): never;
};

// Render the Ink app
const { waitUntilExit } = render(
	<App
		onExit={() => {
			Deno.exit(0);
		}}
	/>,
);

// Wait for the app to exit
await waitUntilExit();
