# Repair & Equipment Replacement Management System

A comprehensive full-stack web application for managing device repairs, equipment inventory, and stock withdrawals with built-in PDF reporting and real-time analytics.

## 📁 Project Structure
- `/client`: Frontend application built with React 19, Vite, and TypeScript.
- `/server`: Backend REST API built with Node.js, Express, and PostgreSQL.

## 🛠 Tech Stack
### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Routing**: React Router 7
- **Data Visualization**: Recharts
- **Icons**: Lucide React
- **Document Printing**: React print templates via the browser print dialog

### Backend
- **Runtime**: Node.js & Express
- **Database**: PostgreSQL (auto-migrations on startup), accessed via `pg`
- **Authentication**: JWT (`jsonwebtoken`) + `bcryptjs` password hashing
- **File Uploads**: Multer
- **Middleware**: CORS, Morgan (logging), login rate limiting, security headers, centralized error handling.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### Installation

1. **Install Server Dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Install Client Dependencies:**
   ```bash
   cd ../client
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cd ../server
   cp .env.example .env   # then set JWT_SECRET and SEED_ADMIN_PASSWORD
   ```
   For development, missing values fall back to insecure defaults (with a warning).
   For production this is mandatory — see [`DEPLOY.md`](DEPLOY.md).

### Running the Application

1. **Start the Backend:**
   ```bash
   cd server
   npm run dev
   ```
   The server will run on [http://localhost:5221](http://localhost:5221).

2. **Start the Frontend:**
   ```bash
   cd client
   npm run dev
   ```
   The frontend will run on [http://localhost:5222](http://localhost:5222).

## ✨ Key Features
- **Authentication & User Management**: JWT-based login with per-user permission gates, full-access (admin) accounts, forced password change on first login, and login rate limiting.
- **Audit Logs**: Server-side audit trail of state-changing actions, searchable from the admin UI.
- **Contracts**: Track service contracts and link withdrawals/assets to them.
- **Executive Command Center V2**: High-density analytical dashboard with Bento Grid layout, interactive Recharts (Asset Health, Workload, Stock Movements), and real-time operational pulse timeline.
- **The Executive Hub Redesign**: Premium UI/UX featuring global glassmorphism, frosted glass headers, centered command palette (Ctrl+K), and smooth reveal animations.
- **Repair Tracking**: Full lifecycle management of repair tickets, including technician assignments and status history.
- **Inventory Management**: Comprehensive stock tracking with minimum stock alerts and image support for equipment identification.
- **Withdrawal System**: Support for multiple withdrawal types (New Install, Backup, Testing) with automated stock deduction.
- **Station Management**: Comprehensive station tracking with automated code generation (`STN-{id}-{dir}`), status management, and custom station types.
- **Data Integrity Tools**: Built-in scripts for database maintenance, migrations, and comprehensive data clearing (`clear_all_data.js`) plus 1,000 WIM stations seeder for testing.
- **Global Search (Ctrl+K)**: Centered command palette for quick navigation and searching across repairs, claims, inventory, and stations.
- **Return Tracking**: Manage returnable withdrawals for testing or backup units with 30-day overdue indicators.
- **Purchase Orders (PO)**: Automated draft PO creation when inventory falls below minimum stock level (`min_stock`), custom manual PO builder, non-inventory items support, and stock replenishment workflow upon receipt.
- **Executive Reports**: Visual reports with timezone-safe custom date range filters, clean printing layout, and Excel-compatible client-side CSV exports.
- **PDF Reporting**: Generate professional "Dashboard Style" infographic PDF reports for repairs, withdrawals, and purchase orders.
- **Image Management**: Attach diagnostic or product images to repairs and inventory items.

## 🚢 Production Deployment
For production setup (environment config, build, PM2, pre-flight checks, first
login), follow [`DEPLOY.md`](DEPLOY.md). Run `npm run production:check` from the
project root to validate the environment before going live.

---
*Last updated: 2026-06-24*

## Fresh database and release checks

For a new PostgreSQL installation, create an empty database and configure
`DATABASE_URL` in `server/.env`. The server applies all migrations at startup;
legacy data repair is not required for a fresh database.

Before release, run `npm run production:check` from the project root. The CI
workflow also runs client lint/tests/build, server integration/security tests,
and the fresh-migration test.
