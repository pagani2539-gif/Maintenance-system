# Project Context & Business Logic

This document provides context on the business domains and core workflows of the Repair & Equipment Replacement Management System.

## Domain Overview

### 1. Repair Management
The system tracks the lifecycle of equipment repairs.
- **Workflow**: Reporter submits a ticket -> Status defaults to "รอดำเนินการ" (Pending) -> Technician is assigned -> Status updates (e.g., In Progress, Waiting for Parts) -> Repair is completed.
- **Key Actions**: Logging technician notes, tracking device serial/model changes, and attaching diagnostic/completion images.
- **PDF Export**: Users can generate a formal repair report PDF for physical documentation.

### 2. Inventory Management
Tracks spare parts and equipment available for replacement or use.
- **Stock Tracking**: Maintains quantity, model, and descriptions.
- **Alerting**: Supports minimum stock levels (`min_stock`) to notify when reordering is needed.
- **Visuals**: Supports uploading product images for easy identification.

### 3. Equipment Withdrawal
Manages the process of taking equipment out of inventory for specific uses.
- **Types**: Withdrawal types include "ติดตั้งใหม่" (New Installation), "สำรองใช้งาน" (Backup), and "ทดสอบ" (Testing).
- **Process**: Users select items from inventory -> Specify quantities -> Assign to a recipient/project -> Stock is automatically deducted from inventory.
- **Templates**: Generates standardized withdrawal slips via PDF templates.

### 4. Purchase Order (PO) Management
Procures new parts and equipment to ensure smooth business operations.
- **Automated Drafts**: When withdrawals or updates decrease stock levels below the minimum threshold (`min_stock`), the system automatically spawns a draft PO detailing required replenishment quantities.
- **Manual PO Builder**: Supports custom ordering, including adding completely new/unregistered items which are automatically registered into the database with 0 stock upon PO submission.
- **Receiving Workflow**: Upon marking a PO as "Received", inventory quantities are incremented, and corresponding ledger additions (`ADD_STOCK`) are recorded.
- **Deletions & Rollback**: To fix user mistakes, POs (even `Received` ones) can be deleted. Deleting a received PO automatically decrements the received stock quantities (using `MAX(0, quantity - ?)` to avoid negative stock) and deletes corresponding transaction log records under a safe SQL transaction block.

### 5. Transaction Ledger & Returns Auditing
Maintains a detailed audit trail of all inventory movement categories (Inbound, Outbound, Borrow, Return, Adjustments).
- **Returnable Withdrawals**: Testing and Backup withdrawals are marked as returnable. Users can complete returns directly inside the ledger page.
- **Return Audits**: Tracks exact return dates, duration of usage (in days), condition state of returned units, returner details, and custom notes.
- **Overdue Warnings**: Items withdrawn for Testing or Backup have a 30-day expected-return limit. If unreturned, they are marked with red "Overdue" indicators on both lists and detail modals.

## Utility Context

### Document Printing
The system renders hidden React print templates and opens the browser print dialog.
- **Logic**: `PrintDialog` mounts the selected template, then `printElement` opens a print-ready document window. Users can print directly or save as PDF through the browser.
- **Location**: `client/src/components/PrintDialog.tsx`, `client/src/utils/pdfGenerator.ts`, and associated template components in `client/src/components/`.

### File Management
Uploaded images are stored in `server/uploads/` and served statically.
- **Association**: Images are linked to repair records via the `repair_images` table, categorized by `image_type` (e.g., 'before', 'after').
