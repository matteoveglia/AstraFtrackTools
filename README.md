# AstraFtrackTools

_by [Astra Lumen Images Inc.](https://astralumen.co/)_

A suite of command-line tools for Ftrack.

## Features

### 🗒️ | Inspect a Task

Outputs the schema and data for a given task.

### 🎬 | Inspect a Shot

Outputs the schema and data for a given shot.

### ✨ | Inspect a Version

Outputs the schema and data for a given version.

### 🖼️ | Propagate Thumbnails

Updates shot thumbnails from their latest versions.
Includes A–Z sorting, progress tracking with ETA, and smart detection of existing thumbnails to avoid unnecessary updates.

### 📥 | Download Media

Download media files from Ftrack versions, either individually by ID or in bulk from multiple shots, with filtering and search to suit your workflow.

**Key Features:**
- **Single Version Download**: Download media from a specific version by ID
- **Multiple Shot Download**: Bulk download from shots using fuzzy search patterns
- **Advanced Filtering**: Filter shots and versions by status, user, date, and custom attributes
- **Media Preferences**: Choose between original files, encoded files, or both
- **Progress Tracking**: Real‑time download progress with file size information
- **Fallback Handling**: Automatic and manual fallback options for failed downloads
- **Concurrent Downloads**: Efficient batch processing with configurable concurrency
- **Smart Organisation**: Downloads organised by shot and version structure

### 🔄 | Update Latest Versions Sent

Finds the latest delivered version for each shot and updates the
"latestVersionSent" and "latestVersionSentDate" custom attributes on the shot
level.

### 🗑️ | Delete Media

Manage version and component deletion in Ftrack.
Supports multiple selection methods including direct ID input, shot name wildcards,
list-based selection, and advanced pattern matching. Features dry-run previews,
CSV reports, and flexible component deletion strategies.

**Key Features:**
- **Multiple Selection Methods**: Direct IDs, shot name patterns, list selection, or advanced search
- **Wildcard Support**: Use `*` for pattern matching in shot names (e.g., `SHOT_*` matches all shots starting with "SHOT_")
- **Advanced Selection**: Pagination, filtering, fuzzy search, and interactive refinement
- **Dry Run Mode**: Preview deletions before they happen, with a detailed impact summary
- **CSV Reports**: Export deletion reports to the Downloads folder for record‑keeping
- **Component Strategies**: Choose to delete all components, original only, or encoded only
- **Batch Operations**: Efficient handling of large deletion sets with progress tracking

### 🔐 | Secure

During normal use, all API calls are made directly to Ftrack, and API keys
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

No custom attributes required — works with standard Ftrack entities (AssetVersion, Component)

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
- Dry-run mode shows a preview before deletion
- CSV reports exported to the Downloads folder
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

Due to macOS security restrictions, the binary is unsigned. You may need to remove the quarantine flag before running it:

1. Download the relevant file under
   [Releases](https://github.com/your-repo/AstraFtrackTools/releases/latest).
2. Open Terminal.
3. Navigate to the Downloads folder:

```bash
cd ~/Downloads
```

4. Remove the quarantine flag:

```bash
xattr -d com.apple.quarantine astraftracktools-macos
```

5. Make it executable:

```bash
chmod +x astraftracktools-macos
```

6. Run it:

```bash
./astraftracktools-macos
```

## First Setup

On first run, the app will ask you for your Ftrack credentials and automatically
test them:

- **Ftrack Server URL** (e.g. https://yourcompany.ftrackapp.com)
- **Ftrack API User** (e.g. your Ftrack‑associated email)
- **Ftrack API Key** (secure password input)

### Getting your API key

1. Log in to your Ftrack instance
2. Go to **My Account** (top right)
3. Navigate to **Security Settings**
4. Under **Personal API Key**, click **Generate New Key**
   - ⚠️ This key will only appear once and can be revoked/regenerated at any time

The tool will automatically test your credentials and securely store them
locally. You can update your credentials at any time using the "Set Ftrack Credentials"
option in the main menu.

# Development

## Technology stack

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

## Licence

This project is licensed under the terms of the [LICENSE](./LICENSE) file.
