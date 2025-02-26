# AstraFtrackTools

## Description

A suite of tools to be used with Ftrack.

## Technology Stack

- TypeScript
- Deno 2
- Ftrack API
- Inquirer

## Features

- Inspect a task

> This will output the schema and data for a given task

- Inspect a shot

> This will output the schema and data for a given shot

- Inspect a version

> This will output the schema and data for a given version

- Propagate thumbnails

> This tool allows you to update the shot thumbnail of any/all shots to that of
> the latest version

- Update latest versions sent

> This tool grabs the latest delivered version for each shot and updates the
> "latestVersionSent" and "latestVersionSentDate" custom attributes on the shot
> level.

## Custom Ftrack Attribute Requirements

It required custom attributes on the AssetVersion:

- custom_delivered
- custom_date_sent

and on the Shot:

- latestVersionSent
- latestVersionSentDate

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
