# API Endpoints ทั้งหมด (79 ตัว)

ทุก endpoint ต้องผ่าน `requireAuth` ยกเว้น `/api/auth/login`

## Auth (3)
| Method | Path | ทำอะไร |
|---|---|---|
| POST | `/api/auth/login` | เข้าสู่ระบบ (จำกัด 10 ครั้ง/15 นาที) |
| GET | `/api/auth/me` | ดึงข้อมูลผู้ใช้ที่ล็อกอินอยู่ |
| POST | `/api/auth/change-password` | เปลี่ยนรหัสผ่าน |

## Repairs — ซ่อม/เคลม (13)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/repairs/stats` | สถิติงานซ่อม |
| GET | `/api/repairs/dashboard-stats` | สถิติภาพรวมสำหรับแดชบอร์ด (KPI, แนวโน้ม, ภาระงาน) |
| GET | `/api/repairs/unread-count` | จำนวนแจ้งซ่อมที่ยังไม่อ่าน |
| GET | `/api/repairs` | ดูรายการแจ้งซ่อมทั้งหมด |
| POST | `/api/repairs` | สร้างรายการแจ้งซ่อมใหม่ (แนบรูปได้) |
| POST | `/api/repairs/claim` | สร้างรายการเคลมใหม่ (แนบรูปได้) |
| GET | `/api/repairs/:id` | ดูรายละเอียดงานซ่อม |
| PATCH | `/api/repairs/:id` | แก้ไขข้อมูลงานซ่อม |
| PATCH | `/api/repairs/:id/status` | เปลี่ยนสถานะงานซ่อม |
| PATCH | `/api/repairs/:id/read` | ทำเครื่องหมายว่าอ่านแล้ว |
| PATCH | `/api/repairs/:id/company` | เปลี่ยนบริษัทที่รับผิดชอบ |
| DELETE | `/api/repairs/remove/:id` | ลบงานซ่อม (ต้องมีสิทธิ์ delete.repairs/claims) |
| POST | `/api/repairs/:id/replace-device` | เปลี่ยนอุปกรณ์ในงานซ่อม |

## Inventory — คลังพัสดุ (10)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/inventory/stats` | สถิติคลังพัสดุ |
| GET | `/api/inventory/lifecycle-report` | รายงานวิเคราะห์อายุการใช้งานอุปกรณ์ |
| GET | `/api/inventory` | ดูรายการอุปกรณ์ทั้งหมด (ค้นหาได้) |
| GET | `/api/inventory/:id/instances` | ดู S/N อุปกรณ์ที่มีในสต็อก |
| PATCH | `/api/inventory/instances/:instanceId/condition` | อัปเดตสภาพของอุปกรณ์ (ตาม S/N) |
| POST | `/api/inventory/:id/serial-numbers` | เพิ่ม S/N ให้อุปกรณ์ |
| POST | `/api/inventory/import` | นำเข้าอุปกรณ์เป็นชุด (bulk import) |
| POST | `/api/inventory` | เพิ่มอุปกรณ์ใหม่ (แนบรูปได้) |
| PATCH | `/api/inventory/:id` | แก้ไขข้อมูลอุปกรณ์ (แนบรูปได้) |
| DELETE | `/api/inventory/:id` | ลบอุปกรณ์ (ต้องมีสิทธิ์ delete.inventory) |

## Withdrawals — เบิกของ (6)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/withdrawals` | ดูรายการเบิกทั้งหมด |
| GET | `/api/withdrawals/:id` | ดูรายละเอียดใบเบิก |
| POST | `/api/withdrawals` | สร้างใบเบิกใหม่ |
| PUT | `/api/withdrawals/:id/items/:itemId/serial-numbers` | แก้ไข S/N ของรายการที่เบิก |
| PATCH | `/api/withdrawals/:id/company` | เปลี่ยนบริษัทที่รับผิดชอบ |
| DELETE | `/api/withdrawals/:id` | ลบใบเบิก (ต้องมีสิทธิ์ delete.withdrawals) |

## Transactions — รับ-คืนของ (4)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/transactions/latest` | ดูรายการเคลื่อนไหวล่าสุด |
| GET | `/api/transactions` | ดูประวัติเคลื่อนไหวคลัง (กรองได้) |
| POST | `/api/transactions/return` | คืนของที่เบิก/ยืมไป (แนบรูปได้) |
| DELETE | `/api/transactions/:id` | ลบรายการเคลื่อนไหว (ต้องมีสิทธิ์ delete.transactions) |

## Purchase Orders — ใบสั่งซื้อ (9)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/purchase-orders` | ดูรายการ PO ทั้งหมด (กรองตามสถานะ) |
| GET | `/api/purchase-orders/vendors` | ดูรายชื่อผู้จำหน่าย |
| POST | `/api/purchase-orders/auto-generate` | สั่งสร้าง PO อัตโนมัติ |
| GET | `/api/purchase-orders/:id` | ดูรายละเอียด PO พร้อมรายการสินค้า |
| POST | `/api/purchase-orders` | สร้าง PO ใหม่ |
| PATCH | `/api/purchase-orders/:id` | แก้ไข PO |
| PATCH | `/api/purchase-orders/:id/company` | เปลี่ยนบริษัทที่รับผิดชอบ |
| DELETE | `/api/purchase-orders/:id` | ลบ PO (ต้องมีสิทธิ์ delete.purchase_orders) |
| POST | `/api/purchase-orders/:id/receive` | บันทึกการรับของตาม PO |

## Search (1)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/search` | ค้นหาข้ามหมวด (คลัง/ซ่อม/เคลม) |

## Stations — สถานี (6)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/stations` | ดูรายชื่อสถานีทั้งหมด (กรองตามสถานะ) |
| GET | `/api/stations/details` | ดูรายละเอียดสถานี (งานซ่อม/เคลม/เบิก/เคลื่อนไหว) |
| POST | `/api/stations` | สร้างสถานีใหม่ |
| PUT | `/api/stations/:stationId/assets/:inventoryId/status` | อัปเดตสถานะอุปกรณ์ประจำสถานี |
| DELETE | `/api/stations/:id` | ลบสถานี (ต้องมีสิทธิ์ delete.stations) |
| PATCH | `/api/stations/:id` | แก้ไขข้อมูลสถานี |

## Contracts — สัญญา (4)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/contracts` | ดูรายการสัญญาทั้งหมด (กรองตามสถานะ) |
| POST | `/api/contracts` | สร้างสัญญาใหม่ |
| DELETE | `/api/contracts/:id` | ลบสัญญา (ต้องมีสิทธิ์ delete.contracts) |
| PATCH | `/api/contracts/:id` | แก้ไขสัญญา |

## Settings — ตั้งค่าระบบ (17)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/settings/companies` | ดูรายชื่อบริษัท |
| POST | `/api/settings/companies` | สร้างบริษัทใหม่ |
| GET | `/api/settings/companies/:id` | ดูรายละเอียดบริษัท |
| PUT | `/api/settings/companies/:id` | แก้ไขข้อมูลบริษัท |
| DELETE | `/api/settings/companies/:id` | ลบบริษัท (ต้องเหลืออย่างน้อย 1 บริษัท) |
| PATCH | `/api/settings/companies/:id/default` | ตั้งเป็นบริษัทหลัก |
| GET | `/api/settings/logos` | ดูโลโก้บริษัท |
| POST | `/api/settings/logos` | อัปโหลดโลโก้ |
| PATCH | `/api/settings/logos/:id/default` | ตั้งเป็นโลโก้หลัก |
| DELETE | `/api/settings/logos/:id` | ลบโลโก้ |
| GET | `/api/settings/system` | ดูค่าตั้งระบบ (LINE token ฯลฯ) |
| PUT | `/api/settings/system` | แก้ไขค่าตั้งระบบ (ต้องสิทธิ์ Full) |
| GET | `/api/settings/backups` | ดูรายการไฟล์สำรองข้อมูล (ต้องสิทธิ์ Full) |
| POST | `/api/settings/backups` | สร้างไฟล์สำรองข้อมูล (ต้องสิทธิ์ Full) |
| DELETE | `/api/settings/backups/:filename` | ลบไฟล์สำรองข้อมูล (ต้องสิทธิ์ Full) |
| GET | `/api/settings/backups/download/:filename` | ดาวน์โหลดไฟล์สำรองข้อมูล (ต้องสิทธิ์ Full) |
| POST | `/api/settings/backups/restore` | กู้คืนฐานข้อมูลจากไฟล์สำรอง (ต้องสิทธิ์ Full) |

## Users — จัดการผู้ใช้ (5, ต้องสิทธิ์ Full ทั้งหมด)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/users` | ดูรายชื่อผู้ใช้ทั้งหมด |
| POST | `/api/users` | สร้างผู้ใช้ใหม่ |
| GET | `/api/users/audit-logs` | ดูประวัติการเปลี่ยนแปลงระบบ (audit log) |
| PUT | `/api/users/:id` | แก้ไขข้อมูลผู้ใช้ |
| DELETE | `/api/users/:id` | ลบผู้ใช้ |

## System (1)
| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api` | เช็คสถานะ server (health check) |
