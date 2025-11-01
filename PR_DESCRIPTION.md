# Pull Request: Rebuild TUI with Ink Framework

## Title
Rebuild TUI with Ink Framework

## Summary

This PR completely rebuilds the TUI layer of AstraFtrackTools using **Ink**, a React-based framework for building interactive command-line interfaces. This modernizes the codebase with a component-based architecture while maintaining all existing functionality.

## What is Ink?

Ink (https://github.com/vadimdemedes/ink) is a powerful TUI framework that:
- Uses React components for terminal UIs
- Provides Flexbox-based layouts
- Enables better code organization through components
- Is used by GitHub Copilot, Shopify CLI, Cloudflare Wrangler, and more

## Key Changes

### New Component Architecture

Created a new component-based structure in `src/components/`:
- **App.tsx** - Main application wrapper with state management
- **CredentialsSetup.tsx** - Multi-step Ftrack credentials wizard
- **ProjectSelector.tsx** - Interactive project selection interface
- **MainMenu.tsx** - Main navigation menu with categorized tools
- **ToolRunner.tsx** - Wrapper for executing tools
- **SelectInput.tsx** - Custom keyboard-navigable select component

### Hybrid Approach

This migration uses a hybrid approach:
- **Navigation layer** (menus, setup, selection) → Ink components
- **Tool implementations** → Still use Cliffy prompts (backward compatible)
- The `ToolRunner` component manages stdin/stdout to support both frameworks

This allows for:
- Immediate benefits of Ink for navigation
- Incremental migration of individual tools
- No breaking changes for users

### Configuration Updates

- Added Ink and React dependencies to `deno.json`
- Configured JSX support (`jsx: react-jsx`)
- Updated all task commands to use `index.tsx`
- Original implementation preserved as `index.ts.backup`

## Benefits

1. **Modern Architecture** - Component-based design with clear separation of concerns
2. **Better State Management** - React hooks for predictable state flow
3. **Improved Code Organization** - Reusable, testable components
4. **Industry Standard** - Uses patterns from major production CLIs
5. **Scalability** - Easy to add new features and components
6. **Enhanced UX** - More responsive and consistent UI

## Documentation

Added comprehensive `INK_MIGRATION.md` with:
- Migration overview and rationale
- Detailed component descriptions
- Future enhancement roadmap
- Developer migration guide
- Rollback instructions

## Testing

The application maintains all existing functionality:
- Ftrack credential setup and validation
- Project selection (single project or all projects)
- All existing tools work as before
- Same build targets (Linux, Windows, macOS)

To test:
```bash
deno task dev        # Run in development mode
deno task build      # Build for all platforms
```

## Future Work

Individual tools can be gradually migrated from Cliffy to Ink components for a fully unified React-based TUI experience. The framework is now in place to support this incremental migration.

## Breaking Changes

**For Users:** None - the application functions identically

**For Developers:**
- Entry point changed from `index.ts` to `index.tsx`
- New component architecture requires React/Ink knowledge
- See `INK_MIGRATION.md` for full details

## Rollback

If needed, the original implementation is preserved in `src/index.ts.backup`. Instructions in `INK_MIGRATION.md`.

## Branch Information

- **Source Branch:** `claude/rebuild-tui-app-011CUKCVMQuz63zwH84eAuQL`
- **Target Branch:** `main` (or your default branch)
- **Files Changed:** 10 files (+1277, -9 lines)

## How to Create the PR

Visit: https://github.com/matteoveglia/AstraFtrackTools/pull/new/claude/rebuild-tui-app-011CUKCVMQuz63zwH84eAuQL

Or use the GitHub CLI:
```bash
gh pr create --title "Rebuild TUI with Ink Framework" --body-file PR_DESCRIPTION.md
```

---

Generated with [Claude Code](https://claude.com/claude-code)
