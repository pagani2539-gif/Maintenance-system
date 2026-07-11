---
name: Repair & Equipment Replacement Management System
description: Sleek, confident, and reliable maintenance operations hub.
colors:
  primary: "#29b6f6"
  primary-hover: "#03a9f4"
  bg-app: "#f4f6f9"
  bg-card: "#ffffff"
  bg-sidebar: "#ffffff"
  text-main: "#0f172a"
  text-muted: "#64748b"
  border: "#e2e8f0"
  border-hover: "#cbd5e1"
  danger: "#ef4444"
  success: "#10b981"
  warning: "#d97706"
  info: "#0891b2"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
spacing:
  main-padding: "2.5rem"
  sidebar-width: "280px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-main}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-outline-hover:
    backgroundColor: "rgba(41, 182, 246, 0.08)"
  card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.lg}"
    padding: "2rem"
  input:
    backgroundColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Repair & Equipment Replacement Management System

## 1. Overview

**Creative North Star: "The Executive Hub"**

The Repair & Equipment Replacement Management System is designed for technicians, inventory managers, IT directors, and procurement staff who operate in high-velocity corporate environments. The visual system represents efficiency, precision, and confidence. It balances professional reliability with modern visual delight through a premium **"Executive Hub"** aesthetic.

The interface rejects SaaS marketing cliches in favor of clear, dense, and structured information layouts. It presents key metrics, work progress, and inventory status via a modular **Bento Grid Dashboard**, reducing cognitive load and maximizing usability.

**Key Characteristics:**
- **Glassmorphic Depth**: Global use of frosted glass backgrounds, blurs, and layered elevation shadows to create a sophisticated, high-end feel.
- **Sleek Density**: Structured grids, clean lines, and compact typography that prioritizes readability and quick scanning.
- **Bento Grid Layout**: A modular 12-column grid system for the dashboard that organizes complex analytics into distinct, interactive cards.
- **Micro-Delight**: Responsive elevation scaling, subtle background glows, and rotational transitions on interactive badges.

## 2. Colors

The color palette centers on a primary sky-blue accent combined with clean neutral backgrounds and glassmorphic layers.

### Glassmorphism
- **Glass Background** (`--glass-bg`: `rgba(255, 255, 255, 0.7)`): The base for all frosted glass panels.
- **Glass Blur** (`--glass-blur`: `blur(12px)`): Applied to headers, sidebars, and dashboard cards for depth.

### Primary
- **Active Sky Blue** (#29b6f6): The primary brand identifier. Used for key interactive controls and active navigation.
- **Hover Sky Blue** (#03a9f4): A slightly darker, more saturated shade of the primary color. Used exclusively for hovered states of primary buttons.

### Neutral
- **Slate Text Main** (#0f172a): Dark, high-contrast slate. Used for body text, table text, and headers to ensure WCAG 2.1 AA readability.
- **Muted Slate** (#64748b): Mid-tone slate. Used for secondary text, metadata labels, and inactive filters.
- **Light App Background** (#f4f6f9): Cool gray background. Serves as the main canvas background for the application.
- **White Card Background** (#ffffff): Pure white surface. Used for cards and container panels to stand out from the app background.
- **Border Slate** (#e2e8f0): Thin border color. Used to partition grids, define inputs, and segment table lines.
- **Border Hover** (#cbd5e1): A darker neutral border. Used when interactive containers or inputs are hovered.

### Status Semantic Colors
- **Danger Red** (#ef4444): Used for critical status alerts, expired dates, and destructive actions.
- **Success Green** (#10b981): Used for completed actions, active stocks, and successful operations.
- **Warning Orange** (#d97706): Used for items under review, reorder thresholds, or pending approvals.
- **Info Cyan** (#0891b2): Used for scheduled actions, stock withdrawals, and auxiliary stats.

### Named Rules
**The 10 Percent Accent Rule.** The primary blue accent (#29b6f6) is used for ≤10% of any given viewport. Brand identity is carried by clean layout spacing and purposeful semantic typography rather than blue color-drenching.

## 3. Typography

**Display Font:** Bai Jamjuree (headings, labels, numbers, and short Latin text)
**Body Font:** Sarabun (Thai and Latin body text)

The system pairs the structured, technical Bai Jamjuree typeface for headings, labels, numbers, and short Latin text with the highly legible, formal Sarabun typeface for Thai descriptions, notes, and general table copy.

### Hierarchy
- **Display Heading** (Bai Jamjuree, Bold, 2.25rem (36px), 1.2): Used for main dashboard titles and primary page-level headings.
- **Section Title** (Bai Jamjuree, Semi-Bold, 1.5rem (24px), 1.3): Used for cards headers, transaction segments, and major modal headers.
- **Sub-header** (Bai Jamjuree, Medium, 1.1rem (17.6px), 1.4): Used for secondary labels, KPI subheadings, and descriptive field groupings.
- **Body Copy** (Sarabun, Regular, 0.95rem (15.2px), 1.6): Used for descriptive note fields, table text, and descriptive listings. Line lengths are constrained to ≤75ch for optimal reading.
- **Interactive Label** (Bai Jamjuree, Bold, 0.85rem (13.6px), 1.2): Used for navigation links, secondary button headers, and status badges.

### Named Rules
**The Dual-Font Rule.** Any page displaying mixed language must prioritize Bai Jamjuree for headings, numbers, and short Latin terms, while using Sarabun for Thai body text to maintain visual cohesion and high legibility.

## 4. Elevation

The system uses a subtle, layered depth model where surfaces are flat at rest and float on hover to invite interaction.

### Shadow Vocabulary
- **Shadow Small** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)`): Used for static cards, tables, and standard page headers.
- **Shadow Medium** (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)`): Used for hovered cards and active button states.
- **Primary Glow** (`box-shadow: 0 0 15px rgba(41, 182, 246, 0.2)`): Used under active primary elements and focus rings.

### Named Rules
**The Flat-By-Default Rule.** All containers and layout panels are rendered flat at rest with a 1px border. Height elevation (using translateY and medium shadows) occurs only as a reactive response to hover or focus states.

## 5. Components

### Buttons
- **Shape**: Rounded corners with a 12px radius (var(--radius-md)).
- **Primary**: Background (#29b6f6) and white text, accompanied by primary glow. Padding is 12px 24px.
- **Hover / Focus**: Transitions using 0.4s cubic-bezier(0.23, 1, 0.32, 1). Hover lifts element (`transform: translateY(-3px)`) and darkens background to `#03a9f4` with an enhanced glow.
- **Outline**: Transparent background with Slate Text Main (#0f172a) and 1px Border Slate (#e2e8f0). Hovers fade in a light primary background tint (`rgba(41, 182, 246, 0.08)`) with a blue border shift.

### Inputs / Fields
- **Shape**: Rounded corners with a 12px radius (var(--radius-md)).
- **Standard**: White background, 1px Border Slate (#e2e8f0), padding of 12px 16px.
- **Focus**: Border shifts to primary blue (#29b6f6) with a subtle blue ring glow (`box-shadow: 0 0 0 3px rgba(41, 182, 246, 0.15)`).

### Cards / Containers
- **Corner Style**: Rounded corners with a 14px radius (var(--radius-lg)).
- **Background**: White Card Background (#ffffff) with a 1px Border Slate (#e2e8f0).
- **Interactive Hover**: Lifts container up (`transform: translateY(-6px) scale(1.01)`) and scales border to primary blue (#29b6f6).

### Navigation
- **Sidebar**: High-contrast white background (#ffffff) with a 1px Border Slate (#e2e8f0) on the right. Inactive nav links use Muted Slate (#64748b) text.
- **Active State**: Fades in a primary light background (`rgba(41, 182, 246, 0.08)`) and changes text to Slate Text Main (#0f172a) with a solid blue indicator bar.

## 6. Do's and Don'ts

### Do:
- **Do** wrap notes and long text using `white-space: normal` and `word-break: break-word` inside tables to avoid truncation.
- **Do** align numerical values and action headers to the right of data tables to maintain structured tracking.
- **Do** use Bai Jamjuree for headings, Latin characters, numbers, and KPI stats, while using Sarabun for Thai descriptions and notes.
- **Do** use responsive grids with `repeat(auto-fit, minmax(280px, 1fr))` for fluid layouts without rigid media queries.

### Don't:
- **Don't** use colored side-stripes or borders thicker than 1px on one side of a card, list item, or callout (e.g. no `border-left: 4px solid ...` as accents).
- **Don't** use text gradients (`background-clip: text`) for headers; keep text solid for readability.
- **Don't** overuse em-dashes (— or --) in user-facing Thai copy. Use commas, colons, or parentheses.
- **Don't** animate width, height, padding, or margin properties for sidebar collapse transitions (use transform or discrete flex values to prevent layout thrashing).
- **Don't** nest cards inside other card containers. Use borderless grids for secondary sub-items.
