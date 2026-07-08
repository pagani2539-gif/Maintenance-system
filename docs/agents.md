# AI Agent Guidelines

This document provides instructions and context for AI agents (like Gemini CLI) interacting with this codebase.

## Core Mandates

1. **Tech Stack Integrity**: Always respect the established tech stack (React 19, TypeScript, Node.js, Express, PostgreSQL). Do not introduce alternative frameworks or major libraries without explicit instruction.
2. **Naming Conventions**:
   - **Backend**: Use `camelCase` for variables and `PascalCase` for classes (if any). DB columns in PostgreSQL should follow existing patterns (mostly `snake_case` in this project).
   - **Frontend**: Use `PascalCase` for React components and `camelCase` for hooks and utilities.
3. **Task Tracking**: Whenever a feature is implemented or a bug is fixed, update `TASKS.md` to reflect the progress.
4. **Safety**: Never log or commit sensitive information. `.env` files and SQLite artifacts (`.db`) should be ignored by git.

## Workflow Rules

### 1. Researching Changes
- Use `grep_search` to find relevant API endpoints in `server/routes/` and their implementations in `server/controllers/`.
- Check `client/src/types.ts` for data structures before modifying frontend logic.

### 2. Modifying Code
- **Surgical Edits**: Use the `replace` tool for targeted changes to minimize context drift.
- **Type Safety**: Maintain strict TypeScript typing in the frontend. Do not use `any` unless absolutely necessary and documented.
- **Error Handling**: Always include proper error handling in new API routes and async frontend calls.

### 3. Testing & Validation
- Run `npm run lint` in the `client` directory after making frontend changes.
- Ensure the server starts without errors (`node index.js`) after backend modifications.
- Verify that PDF generation still works after any changes to `utils/pdfGenerator.ts` or print templates.

## Contextual Knowledge
- The system uses a specific PDF generation pattern (React Template -> html2canvas -> jspdf). Be cautious when modifying CSS in print templates as it directly affects PDF output.
- Database migrations run automatically on server startup from `server/database/migrations-pg/` (PostgreSQL). Check these before suggesting schema changes.
