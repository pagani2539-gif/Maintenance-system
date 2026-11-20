# Maintenance System — Combined UX, Responsive, Accessibility and Flow Audit

Date: 20 November 2026  
Environment: isolated PostgreSQL schema `maintenance_test`  
Viewports: 320×568, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1366×768, 1440×900

## Baseline

- Backend: 53/53 tests passed across API contracts, lifecycle flows, stock integrity, security, uploads and permissions.
- Frontend: 19/19 unit tests passed.
- Responsive route sweep: 15/16 passed. The desktop station table exposed an action-group sizing regression.
- Stable capture sweep: 16/16 passed across administrator and restricted-user sessions.
- No page-level horizontal overflow, broken images, console errors, page errors or failed API requests were detected in the stable route sweep.
- Restricted users were redirected away from settings, users, audit logs and technician administration.

## Confirmed findings

### High — Audit Logs are unusable on mobile

The desktop data table is rendered unchanged at 320px. Columns collapse to a few pixels, diff content stacks character-by-character, and the captured page reaches approximately 82,846px high. `overflow: hidden` masks horizontal overflow, so the existing page-overflow assertion does not detect the failure.

Recommendation: replace the mobile table with audit cards, collapse diff details by default, and keep pagination controls outside the data surface.

### High — Station header actions are clipped on mobile

The station page header uses an inline flex row with three non-wrapping action buttons. At 320px the third action is outside the visible viewport while the document still reports zero overflow because the application shell hides overflow.

Recommendation: make the action group wrap or stack at the mobile breakpoint and ensure each action remains fully visible.

### High — Inventory status badges are clipped in mobile cards

`BaseCardList` places a non-shrinking status badge beside a flexible title. Long Thai status labels extend beyond the card edge and are visibly cut off.

Recommendation: allow the header to wrap, constrain the badge to the card width, and move the badge to a second line below the title when space is insufficient.

### Medium — Audit Log pagination buttons have no accessible name

Two icon-only pagination controls expose neither visible text, `aria-label`, nor a title. Automated inspection found the same two unnamed buttons at every viewport.

Recommendation: label them “หน้าก่อนหน้า” and “หน้าถัดไป” and preserve visible focus states.

### Medium — Audit Log desktop table has poor column sizing

The record-ID header wraps into fragments and large diffs make individual rows extremely tall, reducing scanability.

Recommendation: give metadata columns stable minimum widths and open diff details on demand in a drawer or expandable row.

### Medium — Withdrawal-history columns remain over-compressed

Project, location, withdrawal type and S/N/action columns are compressed into fragments near the sticky action column. The table technically stays inside its container but important values are not readable without interaction.

Recommendation: reduce desktop-visible columns by priority, increase the table's intrinsic minimum width, and move secondary values to the detail drawer.

### Low — Station action-group sizing is inconsistent

The desktop regression test measured the station action group at 44px instead of filling its action cell. The button remains visible but alignment behavior differs from other shared tables.

Recommendation: make action-group sizing explicit in the shared component and assert geometric centering rather than the literal computed CSS width string.

### Low — Mobile list pages are excessively long

Several routes render 20 large cards per page. Inventory and repair pages require substantial scrolling before pagination is reached.

Recommendation: reduce mobile page size to 10, add a compact card density, or provide a sticky pagination/filter affordance.

## Healthy areas

- Core stock, withdrawal, return, PO receipt, repair, claim, station and import flows passed isolated integration tests.
- Stock-integrity guards correctly rejected insufficient stock, invalid returns and deletion of protected ledger/received-PO records.
- All audited routes loaded without runtime or API failures.
- No broken images were found in the captured states.
- Restricted routes redirected correctly for a user with no administrative permissions.
- Mobile withdrawal form reflows into one column and keeps required controls visible.

## Evidence limits

- Screenshot inspection does not prove full WCAG compliance or screen-reader behavior.
- Print/PDF visual output was not compared page-by-page in this run.
- Destructive workflows were validated through isolated integration tests rather than production data.
- Loading, empty and forced network-error states need dedicated mocked-response captures for complete visual coverage.

## Recommended order

1. Replace Audit Logs mobile table with cards and collapsible diffs.
2. Fix Station header action wrapping and mobile-card status clipping.
3. Repair withdrawal-history column priorities and shared action alignment.
4. Add accessible names and keyboard regression checks.
5. Add stable-state screenshot gates so loading or blank screenshots are rejected automatically.
