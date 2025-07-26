# AstraFtrackTools Project Rules

## Project Overview
AstraFtrackTools is a command-line application providing essential utilities for Ftrack project management. Key features include version tracking, shot inspection, schema export, list management, and thumbnail propagation. Built with TypeScript and Deno 2 for cross-platform compatibility.

## Tech Stack & Architecture
- Deno 2 runtime with TypeScript in strict mode
- Ftrack API for integration (@ftrack/api)
- Inquirer.js for interactive CLI prompts
- Node.js crypto for secure credential encryption
- Cross-platform binary compilation (Windows, macOS, Linux)
- Vitest and Deno's built-in testing for test coverage

## Code Quality & Standards

### TypeScript Usage
- Use strict TypeScript configuration and avoid implicit any types
- Use explicit return types for all functions, especially async operations
- Prefer interfaces over types for Ftrack entity definitions
- Create clear interfaces for tool configurations and custom attributes
- Define enum types for tool selections and status values
- Document complex Ftrack query types with JSDoc comments
- Use absolute imports from `src/` root

### Tool Development
- Each tool should be a separate module in `src/tools/`
- Use consistent async/await patterns for Ftrack API calls
- Apply JSDoc comments for tool functions with parameter descriptions
- Keep tools focused on single responsibility
- Extract common Ftrack operations into utility functions
- Handle all tool states explicitly (loading, error, success, user cancellation)
- Provide clear progress indicators for long-running operations

### CLI and User Experience Guidelines
- Use Inquirer.js for consistent interactive prompts
- Implement proper input validation with helpful error messages
- Follow consistent prompt patterns across all tools
- Use clear, descriptive prompt messages and choices
- Implement confirmation prompts for destructive operations
- Provide helpful feedback and progress updates
- Support both interactive and programmatic usage patterns

### Ftrack Integration Patterns
- Use consistent session management across all tools
- Implement proper error handling for API failures and network issues
- Cache frequently accessed data (projects, schemas) appropriately
- Transform Ftrack entities to internal types consistently
- Handle authentication and credential management securely
- Use efficient querying patterns to minimize API calls
- Implement retry logic for transient failures

### Error Handling
- Use custom error classes for different error categories (FtrackApiError, ValidationError)
- Provide proper error context and actionable recovery suggestions
- Handle errors at appropriate layers without crashing the application
- Transform technical Ftrack errors into user-friendly messages
- Implement graceful degradation for non-critical failures
- Log errors appropriately while respecting user privacy

### Security & Credentials
- Never log or expose Ftrack credentials in any form
- Use encrypted storage for sensitive configuration data
- Implement secure credential validation before tool execution
- Handle credential expiration and refresh gracefully
- Validate all user inputs to prevent injection attacks
- Use OS-specific secure storage paths for preferences

## File Organisation & Naming

### Structure
```
src/
├── tools/           # Individual tool implementations
├── utils/           # Shared utilities and helpers
├── types/           # TypeScript interfaces and types
├── schemas/         # Ftrack schema definitions and exports
└── tests/           # Test files mirroring src structure
```

### Naming Conventions
- Use camelCase for tool files (e.g., `inspectShot.ts`)
- Use camelCase for utility files (e.g., `preferences.ts`)
- Use PascalCase for type definition files (e.g., `CustomAttributes.ts`)
- Use descriptive names that reflect tool functionality
- Prefix test files with the module name (e.g., `inspectShot.test.ts`)

### File Size Guidelines
- Tool modules: Target 200-400 lines maximum
- Utility modules: Target 150-250 lines maximum
- Type definition files: Target 100-200 lines maximum
- Break into smaller modules when approaching limits
- Extract common patterns into shared utilities

## Testing Strategy

### Primary Approach: Unit and Integration Testing
- Use Deno's built-in testing as the primary framework
- Standardize on Deno testing instead of mixing with Vitest
- Mock Ftrack API calls using consistent patterns
- Test tool workflows from user input to Ftrack operations
- Use realistic test data that mirrors actual Ftrack entities
- Validate error handling and edge cases thoroughly

### Tool Testing
- Test interactive prompts and user input validation
- Mock Inquirer prompts for automated testing
- Test both success and failure scenarios
- Validate Ftrack query construction and execution
- Test credential handling without exposing sensitive data

### Testing Structure
- **Unit Tests**: For utility functions and type guards
- **Integration Tests**: For complete tool workflows
- **Mock Strategy**: Mock external dependencies (Ftrack API, file system)
- Use comprehensive test utilities for Ftrack entity creation

## Development Practices

### Import Organisation
```typescript
// Deno std → External libraries → Local modules → Types
import { assertEquals } from "@std/assert";
import inquirer from "npm:inquirer";

import { debug } from "../utils/debug.ts";
import { initInquirerPrompt } from "../utils/inquirerInit.ts";

import type { FtrackSession } from "../types/index.ts";
```

### Performance Considerations
- Minimize Ftrack API calls through efficient querying
- Use batch operations where possible
- Implement caching for frequently accessed data
- Optimize query selectors to fetch only required fields
- Use streaming for large data operations
- Monitor memory usage for large dataset processing

### CLI User Experience
- Provide clear instructions and help text
- Use consistent terminology across all tools
- Implement proper signal handling (Ctrl+C)
- Show progress for long-running operations
- Provide summary information after tool completion
- Support quiet/verbose modes for different use cases

## Deno Integration Guidelines
- Use Deno's built-in APIs where possible over npm packages
- Handle permissions appropriately with minimal required permissions
- Use Deno's configuration in `deno.json` for tasks and dependencies
- Implement proper cross-platform file path handling
- Use Deno's built-in testing and formatting tools
- Handle Deno-specific quirks (like Inquirer initialization)

## Project Scoping & Context Management
- Implement project selection at application startup
- Maintain project context throughout tool execution
- Scope all Ftrack queries to selected project when applicable
- Provide "Global" option for cross-project operations
- Store project preferences securely with other credentials
- Validate project access before tool execution

## Code Documentation
- Add JSDoc comments for all public tool functions
- Document Ftrack entity interfaces and custom attributes
- Include usage examples in tool documentation
- Maintain README.md with current feature list
- Document configuration requirements and setup steps
- Add inline comments for complex Ftrack query logic

## Build & Deployment
- Support cross-platform binary compilation
- Use consistent versioning across all platforms
- Implement proper error handling in build scripts
- Test binaries on target platforms before release
- Maintain backwards compatibility for configuration files
- Document installation and update procedures
