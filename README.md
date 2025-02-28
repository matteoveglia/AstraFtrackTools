# AstraFtrackTools

## Description

A suite of tools to be used with Ftrack.

## Technology Stack

- TypeScript
- Deno 2
- Ftrack API
- Inquirer

## Features

### 🗒️ Inspect a Task 

This will output the schema and data for a given task

### 🎬 Inspect a Shot 

This will output the schema and data for a given shot

### ✨ Inspect a Version

This will output the schema and data for a given version

### 🖼️ Propagate Thumbnails

This tool allows you to update the shot thumbnail of any/all shots to that of
the latest version

### 🔄 Update Latest Versions Sent

This tool grabs the latest delivered version for each shot and updates the "latestVersionSent" and "latestVersionSentDate" custom attributes on the shot level.

## Custom Ftrack Attribute Requirements

It required custom attributes on the AssetVersion:

- custom_delivered
- custom_date_sent

and on the Shot:

- latestVersionSent
- latestVersionSentDate

## Running from Binaries

To run the application from binaries under "Releases"

#### Windows/Linux

Simply download the relevant file under Release and open it

#### macOS

Due to aggresive security restrictions on macOS, and me not wanting to pay for a developer license, I can't easily sign the binary to avoid a warning message. So you'll need to:
1. Open Terminal
2. Navigate to the downloads folder: ```cd ~/Downloads```   
3. Remove quarantine flag: ```xattr -d com.apple.quarantine astraftracktools-macos```
4. Make executable: ```chmod +x astraftracktools-macos```
5. Run: ```./astraftracktools-macos```

## Installation

1. Install Deno: https://deno.land/
2. Clone this repository
3. Copy .env.example to .env and configure your Ftrack credentials
4. Install dependencies:

```bash
deno install
```

## Development

### Running the application

```bash
deno task start
```

### Development mode (with watch)

```bash
deno task dev
```

### Debug mode

```bash
deno task dev:debug
```

### Building the application

```bash
deno task build
```

### Running tests

```bash
deno task test
```

### Generating test coverage

```bash
deno task coverage
```

## Project Structure

```
├── src/            # Source code
│   ├── main.ts     # Entry point
│   └── ...        # Other source files
├── .env            # Environment variables
├── deno.json       # Deno configuration
├── deno.lock       # Dependency lock file
└── package.json    # Node.js package configuration
```

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

This project is licensed under the terms of the [LICENSE](./LICENSE) file.
