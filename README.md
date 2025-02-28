# AstraFtrackTools
_by Astra Lumen Images Inc._

A suite of tools to be used with Ftrack.

## Features

### 🗒️ | Inspect a Task 

This will output the schema and data for a given task

### 🎬 | Inspect a Shot 

This will output the schema and data for a given shot

### ✨ | Inspect a Version

This will output the schema and data for a given version

### 🖼️ | Propagate Thumbnails

This tool allows you to update the shot thumbnail of any/all shots to that of
the latest version

### 🔄 | Update Latest Versions Sent

This tool grabs the latest delivered version for each shot and updates the "latestVersionSent" and "latestVersionSentDate" custom attributes on the shot level.

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
On first run, the tool will ask you for your Ftrack credentials, specificcally:
- Ftrack Server URL (e.g. https://yourcompany.ftrackapp.com)
- Ftrack API User (e.g. your ftrack associated email)
- Ftrack API Key

The easiest way to obtain your API key is through your Ftrack settings:
1. Go to My Account, top right of Ftrack
2. Go to Security Settings
3. Under Personal API Key click on Generate New Key
- Note: This key will only appear once, it can be revoked and regenerated at any time.

Once you have entered your credentials, the tool will configure itself and be ready to use.

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
