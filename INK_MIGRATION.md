# Ink TUI Framework Migration

## Overview

This PR migrates AstraFtrackTools from a Cliffy-based CLI to an Ink-based TUI (Terminal User Interface) framework. Ink is a React renderer for building interactive command-line interfaces, providing a more modern, component-based approach to building terminal UIs.

## What is Ink?

Ink (https://github.com/vadimdemedes/ink) is a powerful framework that:
- Uses React components for terminal UIs
- Provides Flexbox-based layouts (powered by Yoga)
- Enables component reusability and composition
- Offers better state management with React hooks
- Is used by major CLIs including GitHub Copilot, Shopify CLI, and Cloudflare Wrangler

## Changes Made

### 1. New Dependencies

Added to `deno.json`:
```json
{
  "ink": "npm:ink@^5.1.0",
  "react": "npm:react@^18.3.1",
  "ink-text-input": "npm:ink-text-input@^6.0.0",
  "ink-select-input": "npm:ink-select-input@^6.0.0",
  "ink-spinner": "npm:ink-spinner@^5.0.0",
  "ink-box": "npm:ink-box@^4.0.0"
}
```

### 2. New Component Architecture

Created a new `src/components/` directory with the following structure:

```
src/components/
├── App.tsx                    # Main application component
├── CredentialsSetup.tsx       # Ftrack credentials setup wizard
├── ProjectSelector.tsx        # Project selection interface
├── MainMenu.tsx               # Main menu navigation
├── ToolRunner.tsx             # Tool execution wrapper
└── common/
    └── SelectInput.tsx        # Custom select input component
```

### 3. Component Descriptions

#### **App.tsx**
- Main application wrapper
- Manages global state (session, project context, services)
- Controls navigation between different screens
- Handles initialization and error states

#### **CredentialsSetup.tsx**
- Multi-step wizard for Ftrack credential configuration
- Validates credentials before saving
- Replaces Cliffy prompts with Ink UI components
- Steps: Welcome → Server → User → API Key → Confirm → Test

#### **ProjectSelector.tsx**
- Displays active Ftrack projects
- Allows selection of project scope or "All Projects" mode
- Integrates with Ftrack API to fetch project list
- Replaces Cliffy Select with Ink components

#### **MainMenu.tsx**
- Main navigation hub
- Displays tools organized by category:
  - Project-Based Tools
  - All-Projects Tools
  - Utilities
- Shows current project context
- Handles tool selection and submenu navigation

#### **ToolRunner.tsx**
- Wrapper for executing individual tools
- Manages stdin/stdout to allow Cliffy prompts in tools
- Displays completion status and messages
- Provides navigation back to menu or exit

#### **SelectInput.tsx**
- Custom implementation of a select input component
- Keyboard navigation (↑/↓ arrows, Enter)
- Support for disabled items (separators)
- Visual feedback for selected item

### 4. Entry Point Changes

**Old:** `src/index.ts` - Procedural code with while loops and Cliffy prompts

**New:** `src/index.tsx` - React-based declarative rendering:
```tsx
import React from "react";
import { render } from "ink";
import { App } from "./components/App.tsx";

const { waitUntilExit } = render(<App onExit={() => Deno.exit(0)} />);
await waitUntilExit();
```

### 5. Configuration Updates

Updated `deno.json`:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

Updated all task commands to use `src/index.tsx` instead of `src/index.ts`.

## Hybrid Approach

This migration uses a **hybrid approach** where:

1. **Navigation layer** (menus, project selection, credentials) → **Ink components**
2. **Tool implementations** → **Still use Cliffy prompts** (for now)

The `ToolRunner` component manages this by:
- Temporarily disabling Ink's raw mode when running a tool
- Allowing Cliffy prompts to function normally
- Re-enabling raw mode when returning to Ink UI

This allows for:
- Incremental migration of individual tools
- Immediate benefits of Ink for navigation
- Backwards compatibility with existing tool code

## Benefits of This Migration

### 1. **Better Code Organization**
- Component-based architecture
- Clear separation of concerns
- Reusable UI components

### 2. **Improved State Management**
- React hooks (useState, useEffect)
- Predictable state flow
- Easier to debug and test

### 3. **Enhanced User Experience**
- More responsive UI
- Better visual feedback
- Consistent navigation patterns

### 4. **Modern Development Practices**
- Declarative UI programming
- Component composition
- Industry-standard patterns

### 5. **Scalability**
- Easy to add new screens/components
- Simple to refactor and extend
- Better suited for complex UIs

## Future Enhancements

### Phase 2: Migrate Tool UIs to Ink
Individual tools can be gradually migrated to use Ink components instead of Cliffy:
- Create custom Ink components for each tool's workflow
- Replace Cliffy prompts with Ink-based inputs
- Maintain consistent UI across entire application

### Phase 3: Advanced UI Components
- Progress bars using Ink components
- Real-time status updates
- Split-screen layouts for complex operations
- Keyboard shortcuts and help screens

### Phase 4: Testing Infrastructure
- Ink provides testing utilities
- Write component tests
- Test navigation flows
- Verify UI rendering

## Breaking Changes

### For Users
**None.** The application functions identically from a user perspective.

### For Developers
- Main entry point changed from `index.ts` to `index.tsx`
- New component architecture requires understanding React/Ink
- Tool modifications now require working with Ink's rendering cycle

## Migration Path for Existing Tools

To migrate a tool from Cliffy to Ink:

1. Create a new component in `src/components/tools/`
2. Replace Cliffy prompts with Ink equivalents:
   - `Input.prompt()` → `<TextInput />`
   - `Select.prompt()` → `<SelectInput />`
   - `Confirm.prompt()` → Custom confirm component
3. Update `ToolRunner.tsx` to render the new component
4. Test the tool's workflow

Example:
```tsx
// Before (Cliffy)
const name = await Input.prompt({ message: "Enter name:" });

// After (Ink)
const [name, setName] = useState("");
<TextInput value={name} onChange={setName} onSubmit={handleSubmit} />
```

## Rollback Plan

If issues arise, the original implementation is preserved:
- Original code: `src/index.ts.backup`
- To rollback:
  1. Rename `index.tsx` → `index.tsx.new`
  2. Rename `index.ts.backup` → `index.ts`
  3. Update `deno.json` tasks to use `index.ts`
  4. Remove Ink dependencies

## Testing

To test the new Ink-based UI:

```bash
# Run development mode
deno task dev

# Build for all platforms
deno task build

# Test specific platform
deno task build-linux
```

## Resources

- **Ink Documentation**: https://github.com/vadimdemedes/ink
- **React Hooks**: https://react.dev/reference/react
- **Deno React Support**: https://docs.deno.com/runtime/manual/advanced/jsx_dom/jsx

## Questions & Feedback

For questions about this migration or issues encountered, please:
1. Review this document
2. Check Ink documentation
3. Open an issue on GitHub
4. Contact the development team

---

**Migration completed by:** Claude (AI Assistant)
**Date:** 2025-10-20
**PR Branch:** `claude/rebuild-tui-app-011CUKCVMQuz63zwH84eAuQL`
