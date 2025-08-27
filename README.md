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

Updates shot thumbnails with thumbnails from their latest asset versions.
Features A-Z sorting, progress tracking with ETA, and smart detection of
existing thumbnails to avoid unnecessary updates.

### 🔄 | Update Latest Versions Sent

This tool grabs the latest delivered version for each shot and updates the
"latestVersionSent" and "latestVersionSentDate" custom attributes on the shot
level.

### 🗑️ | Delete Media

A comprehensive tool for managing asset version and component deletion in Ftrack.
Supports multiple selection methods including direct ID input, shot name wildcards,
list-based selection, and advanced pattern matching. Features dry-run previews,
CSV export reports, and flexible component deletion strategies.

**Key Features:**
- **Multiple Selection Methods**: Direct IDs, shot name patterns, list selection, or advanced search
- **Wildcard Support**: Use `*` for pattern matching in shot names (e.g., `SHOT_*` matches all shots starting with "SHOT_")
- **Advanced Selection**: Pagination, filtering, fuzzy search, and interactive refinement
- **Dry Run Mode**: Preview deletions before execution with detailed impact analysis
- **CSV Reports**: Export deletion reports to Downloads directory for record keeping
- **Component Strategies**: Choose to delete all components, original only, or encoded only
- **Batch Operations**: Efficient handling of large deletion sets with progress tracking

### 🔐 | Secure

During normal usage all API calls are made directly to Ftrack and all API keys
are stored locally and encrypted uniquely to your machine.

## Custom Ftrack Attribute Requirements

### For Update Latest Versions Sent Tool

Required custom attributes on the AssetVersion:
- custom_delivered
- custom_date_sent

Required custom attributes on the Shot:
- latestVersionSent
- latestVersionSentDate

### For Delete Media Tool

No custom attributes required - works with standard Ftrack entities (AssetVersion, Component)

## Usage Examples

### Delete Media Tool

The Delete Media tool provides several ways to select and delete versions or components:

**1. Direct ID Input**
```
Enter version IDs: 12345,67890,11111
```

**2. Shot Name Patterns (with wildcards)**
```
Enter shot name pattern: SHOT_*     # Matches all shots starting with "SHOT_"
Enter shot name pattern: *_010      # Matches all shots ending with "_010"
Enter shot name pattern: SEQ01_*_v* # Complex pattern matching
```

**3. List-based Selection**
- Choose from existing Ftrack lists
- Select specific items from the list

**4. Advanced Selection**
- Pagination through large datasets
- Search and filter capabilities
- Fuzzy matching for approximate searches
- Interactive refinement of results

**Component Deletion Strategies:**
- **All Components**: Delete all associated media files
- **Original Only**: Delete only original/source components
- **Encoded Only**: Delete only encoded/processed components

**Safety Features:**
- Dry-run mode shows preview before deletion
- CSV reports exported to Downloads folder
- Confirmation prompts for destructive operations

## Running from Binaries

#### Windows

Simply download the relevant file under
[Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest) and
open it.

#### Linux

1. Download the relevant file under
   [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest).
2. In the terminal app of your choice, make the file executable:
   ```bash
   chmod +x AstraFtrackTools-linux
   ```
3. Run the executable.

#### macOS

Due to aggresive security restrictions on macOS, and me not wanting to pay for a
developer license, I can't easily sign the binary to avoid a warning message. So
you'll need to:

1. Download the relevant file under
   [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest).
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

On first run, the app will ask you for your Ftrack credentials and automatically
test them:

- **Ftrack Server URL** (e.g. https://yourcompany.ftrackapp.com)
- **Ftrack API User** (e.g. your ftrack associated email)
- **Ftrack API Key** (secure password input)

### Getting Your API Key:

1. Log into your Ftrack instance
2. Go to **My Account** (top right)
3. Navigate to **Security Settings**
4. Under **Personal API Key**, click **Generate New Key**
   - ⚠️ This key will only appear once and can be revoked/regenerated anytime

The tool will automatically test your credentials and securely store them
locally. You can update credentials anytime using the "Set Ftrack Credentials"
option in the main menu.

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
