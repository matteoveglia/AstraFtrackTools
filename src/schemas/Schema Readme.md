# Schema File Generation Instructions

Before using schema.ts with your own ftrack instance:

1. Run the tool with ``pnpm start`` or ``node dist/index.js`` and use the the "Export Schema" option with your ftrack instance API info in a .env file.
The tool will generate a "schema.ts" file in the output directory of the project.

2. Copy the generated "schema.ts" file into this directory

This step is required to ensure the schema matches your specific ftrack site configuration. The schema.ts file contains type definitions and interfaces generated from your ftrack instance's data model.