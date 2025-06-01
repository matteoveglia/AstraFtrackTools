# AstraFtrackTools
_by [Astra Lumen Images Inc.](https://astralumen.co/)_

A suite of tools to be used with Ftrack.

## Features

### 🗒️ | Inspect a Task 
This will output the schema and data for a given task

### 🎬 | Inspect a Shot 

This will output the schema and data for a given shot

### ✨ | Inspect a Version

This will output the schema and data for a given version

### 🖼️ | Propagate Thumbnails

Updates shot thumbnails with thumbnails from their latest asset versions. Features A-Z sorting, progress tracking with ETA, and smart detection of existing thumbnails to avoid unnecessary updates.

### 🔄 | Update Latest Versions Sent

This tool grabs the latest delivered version for each shot and updates the "latestVersionSent" and "latestVersionSentDate" custom attributes on the shot level.

### 🔐 | Secure

During normal usage all API calls are made directly to Ftrack and all API keys are stored locally and encrypted uniquely to your machine.

## Custom Ftrack Attribute Requirements

It required custom attributes on the AssetVersion:

- custom_delivered
- custom_date_sent

and on the Shot:

- latestVersionSent
- latestVersionSentDate

## Running from Binaries

#### Windows

Simply download the relevant file under [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest) and open it.

#### Linux

1. Download the relevant file under [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest).
2. In the terminal app of your choice, make the file executable:
   ```bash
   chmod +x AstraFtrackTools-linux
   ```
3. Run the executable.

#### macOS

Due to aggresive security restrictions on macOS, and me not wanting to pay for a developer license, I can't easily sign the binary to avoid a warning message. So you'll need to:
1. Download the relevant file under [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest).
2. Open Terminal
3. Navigate to the downloads folder:
```bash
cd ~/Downloads
```
4. Remove quarantine flag:
```bash
xattr -d com.apple.quarantine astraftracktools-macos
```
5. Make executable:
```bash
chmod +x astraftracktools-macos
```
6. Run:
```bash
./astraftracktools-macos
```

## First Setup
On first run, the app will ask you for your Ftrack credentials and automatically test them:
- **Ftrack Server URL** (e.g. https://yourcompany.ftrackapp.com)
- **Ftrack API User** (e.g. your ftrack associated email)  
- **Ftrack API Key** (secure password input)

### Getting Your API Key:
1. Log into your Ftrack instance
2. Go to **My Account** (top right)
3. Navigate to **Security Settings**
4. Under **Personal API Key**, click **Generate New Key**
   - ⚠️ This key will only appear once and can be revoked/regenerated anytime

The tool will automatically test your credentials and securely store them locally. You can update credentials anytime using the "Set Ftrack Credentials" option in the main menu.

# Development

## Technology Stack

- TypeScript
- Deno 2
- Ftrack API
- Inquirer

## Installation

1. Install Deno: https://deno.land/
2. Clone this repository
3. Copy .env.example to .env and configure your Ftrack credentials
    - Note: .env is only needed to run the test suite
4. Install dependencies:

```bash
deno install
```

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

## Project Structure

```
├── src/            # Source code
│   ├── main.ts     # Entry point
│   └── ...        # Other source files
├── .env            # Environment variables for testing
├── deno.json       # Deno configuration
├── deno.lock       # Dependency lock file
└── package.json    # Package configuration
```

## Contributing

We welcome contributions and suggestions!

## License

This project is licensed under the terms of the [LICENSE](./LICENSE) file.
