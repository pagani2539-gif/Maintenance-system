# GEMINI.md - Project Context & Instructions

This file provides the foundational context, architecture, and development standards for the **Repair & Equipment Replacement Management System**.

## 1. Project Overview
A full-stack web application designed to manage device repairs, equipment inventory, and stock withdrawals. The system supports real-time tracking, statistics via a dashboard, and PDF report generation.

- **Frontend**: Single Page Application (SPA) built with React 19, Vite, and TypeScript.
- **Backend**: REST API built with Node.js and Express.
- **Database**: PostgreSQL for persistent storage (migrated from SQLite).

## 2. Core Architecture
The system follows a Client-Server model.

- **Client (`/client`)**: Handles UI/UX and user interactions. Uses `axios` for API communication (via `useApi` hook).
- **Server (`/server`)**: Manages business logic, database operations, and file storage (uploads).
- **Data Flow**: User Interaction -> API Request -> Express Route -> Controller -> PostgreSQL -> JSON Response.

## 3. Tech Stack
### Frontend
- **Framework**: React 19 (TypeScript)
- **Routing**: React Router 7
- **Styling**: Vanilla CSS (Responsive)
- **Visualization**: Recharts
- **PDF Generation**: `jspdf` + `html2canvas` (renders hidden React templates)
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Database**: PostgreSQL (via `pg`), migrations run automatically on startup
- **File Handling**: Multer (stores images in `/server/uploads`)

## 4. Key Commands
### Backend (`/server`)
- `npm install`: Install dependencies.
- `npm run dev`: Start server in watch mode (port 5221).

### Frontend (`/client`)
- `npm install`: Install dependencies.
- `npm run dev`: Start development server (port 5222).
- `npm run build`: Build for production.
- `npm run lint`: Run ESLint checks.

## 5. Directory Structure
```text
/client
├── src/
│   ├── components/     # UI components & Print Templates
│   ├── pages/          # View components / routes
│   ├── hooks/          # Custom hooks (e.g., useApi)
│   ├── utils/          # PDF generation & formatting
│   ├── types.ts        # TypeScript interfaces
│   └── api.ts          # API client configuration
/server
├── controllers/        # Business logic & DB queries (repairs, inventory, stations, etc.)
├── routes/             # API endpoint definitions
├── database/           # DB init and migration logic
├── middlewares/        # Error handling & uploads
└── uploads/            # Static image storage

## 6. Development Conventions
- **Language**: The UI is primarily in **Thai**. Maintain consistent terminology.
- **Type Safety**: Maintain strict TypeScript typing in the frontend. Avoid `any`.
- **UI/UX Standard**: Adhere to the **"Executive Hub"** design system:
  - Use **Glassmorphism** (`--glass-bg`, `--glass-blur`) for major layout containers.
  - Organize dashboards and analytical views using the **Bento Grid** layout.
- **Station Management**: 
  - Never allow manual entry of station codes (Code).
  - Use the automated pattern `STN-{id}-{shortDir}` in the backend.
- **Naming**:
  - Components: `PascalCase`.
  - Hooks/Utils: `camelCase`.
  - DB Columns: `snake_case`.
- **Error Handling**: Use the centralized error handler in the backend (`server/middlewares/errorHandler.js`).
- **PDF Generation**: Follow the established pattern: React Template -> `html2canvas` -> `jspdf`.
- **Task Tracking**: Update `TASKS.md` when completing features or fixing bugs.
- **Migrations**: Database schema changes should be handled via migration scripts (e.g., `server/database/migrations/`).

## 7. AI Agent Guidelines (Mandatory)
- **Tech Stack Integrity**: Respect the established React 19 / Node / PostgreSQL stack.
- **Surgical Edits**: Use the `replace` tool for targeted changes.
- **Research**: Always check `types.ts` and existing routes before proposing changes.
- **Validation**: Run `npm run lint` in `/client` and ensure the server starts after backend changes.
- **Security**: Do not log or commit sensitive data or `.db` files.
