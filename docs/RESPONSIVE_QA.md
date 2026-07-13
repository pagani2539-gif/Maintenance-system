# Responsive QA Release Gate

เอกสารนี้เป็น gate บังคับก่อน merge เข้า `main` และก่อนปล่อย Production สำหรับ client ของ Maintenance System

## 1. คำสั่งมาตรฐาน

```powershell
cd "E:\Maintenance system\client"
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test:responsive
```

`test:responsive` แบบปกติจะเปิด production preview และตรวจหน้า Login ทุก viewportโดยอัตโนมัติ

การตรวจทุก protected route ให้ชี้ไปที่ staging/production build ที่ใช้ข้อมูลทดสอบ:

```powershell
$env:RESPONSIVE_BASE_URL="http://127.0.0.1:5221"
$env:RESPONSIVE_USERNAME="responsive-qa-admin"
$env:RESPONSIVE_PASSWORD="<ตั้งค่าภายนอก repo>"
npm.cmd run test:responsive
```

ห้ามบันทึกรหัสผ่านลงไฟล์, commit, workflow หรือ screenshot

## 2. Viewport ที่ระบบอัตโนมัติตรวจ

- 320x568 มือถือขนาดเล็ก
- 390x844 มือถือแนวตั้ง
- 844x390 มือถือแนวนอน
- 768x1024 แท็บเล็ตแนวตั้ง
- 1024x768 แท็บเล็ตแนวนอน
- 1366x768 เดสก์ท็อป

ตรวจรอยต่อด้วย DevTools เพิ่มที่ 430/431, 640/641, 767/768, 1024/1025, 1099/1100 และ 1279/1280

## 3. เกณฑ์ผ่าน

- ไม่มี page-level horizontal overflow ยกเว้นภายใน table scroller ที่ตั้งใจไว้
- Sidebar, mobile header, profile, search และ notification ไม่ทับเนื้อหา
- Mobile card แสดงข้อมูลและ actions ที่ทำได้เทียบเท่าตาราง
- Dialog/drawer อยู่ใน viewport เลื่อนภายในได้ และปุ่ม submit ไม่หลุดจอ
- Form grid ยุบเป็นหนึ่งคอลัมน์, keyboard มือถือไม่บัง action สำคัญ
- Map, chart, QR, scanner และรูปไม่ล้น container
- ใช้งานได้ที่ browser zoom 200% และผู้ใช้สามารถ pinch zoom ได้
- ไม่มี uncaught page error หรือ console error ที่เกิดจากหน้า

## 4. Route groups

- Auth: `/login`, `/change-password`
- Overview: `/`, `/my-tasks`, `/stations`
- Repair/Claim: `/repairs`, `/new`, `/claim`, `/claim-history`
- Inventory/Outbound: `/inventory`, `/withdrawal`, `/withdrawal-history`, `/transactions`, `/pending-returns`
- Inbound/Count: `/purchase-orders`, `/stock-counts`
- Technician: `/technician-stock`, `/technician-stock/movements`, `/technicians`
- Governance: `/reports`, `/settings`, `/users`, `/users/audit-logs`

หน้ารายละเอียดที่ต้องใช้ ID จริง เช่น repair, withdrawal, stock count และ asset timeline ให้ตรวจเพิ่มด้วยข้อมูล staging อย่างน้อยหนึ่งรายการต่อประเภท

## 5. Manual real-device gate

- Android Chrome: กล้อง scanner, permission denied/retry, keyboard และหมุนจอ
- iPhone/iPad Safari: safe area, drawer, dialog scroll, pinch zoom และหมุนจอ
- Windows Edge/Chrome: print preview, A4/PDF, QR label และ popup behavior

P0/P1 ต้องเป็นศูนย์ก่อน merge/deploy ส่วน P2 ที่เหลือต้องเป็น cosmetic และมี owner/กำหนดแก้ชัดเจน
