# CSS Audit Report

วันที่ตรวจ: 2026-09-09  
ขอบเขต: `client/src` และผลจาก production build  
สถานะ: baseline audit และ first systemic refactor pass เสร็จแล้ว; protected runtime sweep ยังรอ credentials

## Executive summary

จุดเสี่ยงหลักไม่ได้อยู่ที่ selector เดียว แต่เกิดจาก stylesheet หลักที่รวมหลายยุคของ design system, responsive contract และ compatibility layer ไว้ในไฟล์เดียว ทำให้กฎท้ายไฟล์สามารถเปลี่ยนพฤติกรรมของ component กลางโดยไม่เห็นจากจุดที่ component ถูกประกาศ

หลักฐานเบื้องต้น:

| รายการ | ผลตรวจ |
|---|---:|
| ไฟล์ CSS entry point ที่ import เข้า app | 1 ไฟล์ (`index.css`) |
| legacy stylesheet ที่เก็บ source เดิม | ประมาณ 175 KB / 5,577 บรรทัด |
| `!important` | 272 จุด |
| `@media` blocks | 51 blocks / หลาย breakpoint ซ้ำกัน |
| `@keyframes` | 30 ชุด |
| CSS variable declarations | ประมาณ 217 จุด |
| `box-shadow` declarations | 127 จุด |
| บรรทัดที่มี inline `style={{...}}` | ประมาณ 2,512 จุด ใน 72 ไฟล์ |

## Baseline verification

| Check | Result | หมายเหตุ |
|---|---|---|
| `npm run lint` | PASS | ESLint ผ่าน |
| `npm run test -- --run` | PASS | 3 test files, 15 tests ผ่าน |
| `npm run build` | PASS | CSS bundle 131.62 kB / gzip 23.03 kB |
| Responsive login gate | PASS | 6/6 viewport ผ่าน |
| Protected route sweep | NOT RUN | 6 tests skipped เพราะไม่มี responsive credentials |

Production build มี warning เรื่อง JavaScript chunks ใหญ่กว่า 500 kB หลายก้อน โดยเฉพาะ `SnScannerModal`, `Dashboard` และ `index.js`; จัดเป็น performance follow-up แยกจาก CSS correctness

Responsive test ครั้งแรกติดตั้ง browser ไม่ครบ จึงติดตั้ง Chromium สำหรับ Playwright แล้วรันซ้ำจน login gate ผ่าน ผลการติดตั้งอยู่นอก repository และไม่ได้แก้ source code

## Post-refactor verification

| Check | Result | หมายเหตุ |
|---|---|---|
| CSS entry point | PASS | `index.css` เหลือเฉพาะ import order |
| Canonical style layers | PASS | tokens, components, table, responsive, page และ print แยกไฟล์ |
| Table contract | PASS | duplicate table core/standard blocks ถูกย้ายออกจาก legacy |
| Sticky action visual | PASS (static/runtime gate) | ไม่มี persistent shadow; ใช้ divider และ centered action group |
| `--bg-main` / `--font-body` | PASS | เพิ่ม compatibility aliases ใน `styles/tokens.css` |
| Duplicate `modalEnter` / `spin` | PASS | รวม/เปลี่ยนชื่อใน legacy layer |
| `npm run lint` | PASS | Stylelint canonical files + ESLint; intentional reduced-motion exception documented |
| `npm run test -- --run` | PASS | 15/15 tests |
| `npm run build` | PASS | CSS 133.90 kB / gzip 23.53 kB; เพิ่มจาก baselineประมาณ 1.7% |
| Responsive suite | PASS | 8/8 ที่รันได้ผ่าน; 8 protected tests skipped เพราะไม่มี credentials |

ตัวเลขหลัง first refactor pass: `!important` ลดจาก 272 เหลือ 253 จุด, keyframes ลดจาก 30 เหลือ 29 ชุด และ table core definitions ใน legacy layer เหลือศูนย์

## Inventory

### CSS sources

- CSS หลักถูก import ที่ `client/src/main.tsx:3` เพียงจุดเดียว
- ไม่พบไฟล์ SCSS, SASS, LESS หรือ CSS module อื่น
- มี embedded `<style>` ใน `ThailandMap`, `NewPurchaseOrderModal`, `TechnicianStockActionModal`, `Lightbox`, `StationQrLabels`, `Login`, `WithdrawalList`, `ChangePassword`, `NewWithdrawal` และ `StationSearch`
- มี dynamic class ที่ต้องกัน false positive ระหว่างค้นหา dead CSS เช่น status, priority, toast และ theme class

### Inline style concentration

ไฟล์ที่มี inline style สูงสุด:

| ไฟล์ | จุดที่พบโดยประมาณ |
|---|---:|
| `pages/StationSearch.tsx` | 339 |
| `pages/WithdrawalDetail.tsx` | 121 |
| `pages/NewWithdrawal.tsx` | 114 |
| `pages/RepairDetail.tsx` | 107 |
| `pages/InventoryList.tsx` | 105 |
| `pages/Settings.tsx` | 104 |
| `components/ui/StationSelector.tsx` | 90 |
| `pages/StockCountDetail.tsx` | 87 |

Inline style จำนวนมากเป็นเหตุผลที่ responsive layer ต้องใช้ `!important`; ก่อนย้ายออกต้องแยกให้ได้ว่าเป็นค่าคงที่, ค่าตาม state หรือค่าจากข้อมูลจริง

## Confirmed findings

### CSS-001 — Data-table rules ถูกประกาศซ้ำและมี precedence ขัดกัน — Resolved

- ระดับเดิม: High; สถานะปัจจุบัน: Resolved ใน canonical runtime layer
- จุดอ้างอิง baseline เดิม: `index.css:1253`, `index.css:1288`, `index.css:3358`, `index.css:3493`; ปัจจุบันดูที่ `styles/table.css` และ `BaseDataTable.tsx`
- หลักฐาน:
  - `.data-table-container` มีอย่างน้อย 3 ชุด
  - `.data-table` มีชุดแรกที่ใช้ `border-collapse: separate !important`, `min-width: max-content`, `table-layout: auto`
  - ชุดท้ายเปลี่ยนเป็น `border-collapse: collapse`, `table-layout: fixed`
  - `BaseDataTable` ยังใช้ inline `tableLayout: fixed` และ wrapper class `w-full overflow-x-auto` แทน `.data-table-container`
- ผลกระทบ: sticky column, ความกว้างจริง, border และการ scroll อาจไม่เหมือนกันระหว่างหน้าที่ใช้ component กลางกับหน้าที่ใช้ class โดยตรง
- การแก้ไข: ย้าย monolith ไป `styles/legacy.css`, ลบ table core/standard blocks ที่ซ้ำ และให้ `styles/table.css` เป็น canonical contract เดียว

### CSS-002 — Sticky column มีหลายแหล่งกำหนด background, border, z-index และ shadow — Resolved for BaseDataTable

- ระดับเดิม: High สำหรับตารางที่มี action/sticky; สถานะปัจจุบัน: Resolved ใน BaseDataTable และ canonical table layer
- จุดอ้างอิง baseline เดิม: `index.css:1338-1385`, `index.css:3357-3385`; ปัจจุบันดูที่ `styles/table.css`, `styles/components.css` และ `BaseDataTable.tsx`
- หลักฐาน:
  - sticky ขวาถูกกำหนดทั้งด้วย `.data-table ...:last-child` และ class เฉพาะ `sticky-actions-col-*`
  - sticky ซ้ายและ pseudo-element shadow ถูกกำหนดใน Smart Table layer
  - action header/cell มี inline `borderLeft`, `position`, `right`, `zIndex`, `width`
  - มี shadow และ inset shadow หลายชุดในระบบตาราง/row
- ผลกระทบ: อาจเห็นเส้นหรือเงาแปลกบริเวณขอบ sticky, เกิด stacking overlap หรือสีพื้นหลังไม่ต่อเนื่องเมื่อ hover/selected
- การแก้ไข: ปิด persistent shadow/pseudo-element, ใช้ divider เดียว, ย้าย static ActionMenu style เข้า CSS และเพิ่ม responsive integrity assertions
- การแก้ไขเพิ่มเติม: `BaseDataTable` คำนวณ action column ด้วย 36px บน pointer ปกติ และ 44px บน pointer แบบ coarse เพื่อไม่ให้ปุ่ม touch ล้น cell

### CSS-003 — มี CSS variable ที่ถูกเรียกใช้โดยไม่มี global declaration/fallback — Resolved

- ระดับ: Medium
- จุดอ้างอิง baseline เดิม: `index.css:514`, `index.css:4654`, `index.css:4737`, `index.css:4859`, `index.css:4880`, `index.css:5423`, `index.css:5445`; ปัจจุบัน alias อยู่ที่ `styles/tokens.css`
- หลักฐาน:
  - `var(--bg-main)` ถูกใช้กับ `.sidebar-toggle-btn` แต่ไม่พบ declaration
  - `var(--font-body)` ถูกใช้ใน dashboard/control-room/brief styles แต่ไม่พบ declaration
- การแก้ไข: เพิ่ม `--bg-main: var(--bg-app)` และ `--font-body: var(--font-ui)` ใน canonical token layer

### CSS-004 — Breakpoint กระจายหลายชุดและซ้ำค่าเดิม

- ระดับ: Medium
- จุดอ้างอิง baseline เดิม: `index.css:216-228`, `index.css:1760+`, `index.css:3153+`, `index.css:4017+`, `index.css:4430+`, `index.css:5024+`, `index.css:5540+`; canonical additions อยู่ที่ `styles/responsive.css`
- หลักฐาน: พบ `max-width: 640px` 12 ครั้ง, `1024px` 11 ครั้งรวม min/max, `max-width: 1100px` 3 ครั้ง, `max-width: 760px` 3 ครั้ง และมีค่าขอบเขต 420/430/480/520/640/767/768/900/1024/1080/1099/1100/1200/1400
- ผลกระทบ: การแก้ rule ใน breakpoint หนึ่งอาจถูก rule ที่ประกาศภายหลังทับ หรือเกิด behavior กระโดดที่รอยต่อ
- แนวทางแก้: ทำ breakpoint map กลางก่อน รวม rule ตาม domain และทดสอบทั้งค่าก่อน/เท่ากับ/หลัง breakpoint

### CSS-005 — Keyframe ชื่อซ้ำ — Resolved

- ระดับ: Medium
- จุดอ้างอิง baseline เดิม: `index.css:1972`, `index.css:2172`, `index.css:2214`, `index.css:3397`; ปัจจุบันตรวจใน `styles/legacy.css`, `styles/components.css` และ `styles/table.css`
- หลักฐาน:
  - `@keyframes modalEnter` ซ้ำ 2 ชุด
  - `@keyframes spin` ซ้ำ 2 ชุด
- ผลกระทบ: animation ที่ใช้ชื่อเดียวกันอาจได้ definition จากชุดท้าย ทำให้ modal หรือ spinner เปลี่ยน behavior โดยไม่ตั้งใจ
- การแก้ไข: รวม modal animation เป็น `modal-enter`, คง `spin` ไว้เพียง definition เดียว และใช้ `table-menu-enter` สำหรับ ActionMenu

### CSS-006 — `!important` และ inline layout ทำให้ cascade แก้ยาก

- ระดับ: Medium
- หลักฐาน baseline: มี `!important` 272 จุด และ inline style หลายพันจุด; หลังรอบแรกเหลือ `!important` 253 จุด และ responsive release contract อยู่ที่ `styles/responsive.css`
- ผลกระทบ: component-level fix อาจไม่ชนะ rule ที่อยู่ท้ายไฟล์หรือ inline style ทำให้เกิดการแก้ซ้อนและ regression ข้ามหน้า
- แนวทางแก้: จัดกลุ่มตามเหตุผลก่อนลด ได้แก่ responsive contract, sticky/table, compatibility และ accidental override; ห้ามลบแบบ bulk

## Candidates requiring runtime confirmation

รายการต่อไปนี้พบจาก static scan แต่ยังไม่ถือเป็น bug จนกว่าจะยืนยันจาก route/state จริง:

- `--row-accent`, `--mouse-x`, `--mouse-y` มี fallback หรือถูกส่งจาก inline/dynamic state
- `--metric-accent` และ `--action-accent` เป็น local token ของ dashboard modifier class
- `--brief-canvas` และ `--control-canvas` เป็น local token ที่อาจใช้ผ่าน component-specific cascade
- `.data-table-container::after` ที่ `index.css:3373-3384` ตั้ง `opacity: 0` ไว้ จึงยังสรุปไม่ได้ว่าเป็นต้นเหตุของเงาในภาพ ต้องตรวจ computed style/pseudo-element ในหน้าที่เกิดจริง
- รายการ CSS ที่ดูเหมือนไม่ถูกใช้ต้องตรวจ dynamic class และ route ที่ login ก่อนลบ

## Coverage gap

ตรวจ browser จริงได้เฉพาะหน้า login ครบ 6 viewport ตาม responsive config และผ่านทั้งหมด หน้า protected 20 routes ถูก skip เพราะไม่มี credentials ใน environment ดังนั้นยังขาดหลักฐาน runtime สำหรับตารางคลังอุปกรณ์, sticky action, modal, dashboard และหน้ารายละเอียด

เพื่อปิด gap ให้รันซ้ำด้วย:

```powershell
$env:RESPONSIVE_USERNAME = '...'
$env:RESPONSIVE_PASSWORD = '...'
npm run test:responsive
```

ไม่ควร commit ค่า credential หรือใส่ลงไฟล์ config

## Recommended remediation order

1. ยืนยันและแก้ `--bg-main` / `--font-body` ที่ไม่มี definition
2. รวม contract ของ table container/table/sticky action และตรวจปัญหาเส้นหรือเงา
3. เพิ่ม route-level responsive evidence สำหรับทุกหน้าที่ใช้ตารางและ modal
4. รวม breakpoint ที่ซ้ำโดยรักษาพฤติกรรมเดิม
5. รวม/เปลี่ยนชื่อ keyframes ซ้ำ
6. ลด inline style และ `!important` เป็นราย component
7. ลบ dead CSS เฉพาะรายการที่ยืนยันจาก route/state แล้ว
8. เพิ่ม visual regression สำหรับ table action, sticky column, theme, modal และ responsive boundary

## Acceptance status

- [x] Source inventory เบื้องต้น
- [x] Static cascade risk scan
- [x] Lint
- [x] Unit tests
- [x] Production build
- [x] Public responsive login gate
- [ ] Protected route responsive sweep (รอ credentials)
- [ ] Browser evidence ของทุก table/modal/dashboard state (รอ protected route access)
- [ ] Contrast/focus/keyboard/zoom audit ครบทุก route
- [ ] Visual regression หลัง remediation

ไม่มีการเปลี่ยน API, database, sorting หรือ pagination; CSS source ถูก refactor ตามแผน และ legacy layer ยังถูกเก็บไว้เป็น rollback boundary
