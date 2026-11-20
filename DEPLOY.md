# คู่มือการรันระบบในโหมดใช้งานจริง (Production Deployment)

คู่มือนี้แนะนำขั้นตอนการขึ้นระบบเพื่อให้ทำงานได้อย่างเสถียร ปลอดภัย และทำงานอยู่เบื้องหลังตลอดเวลา

---

## 🐘 0. ติดตั้ง PostgreSQL (ครั้งเดียว)
ระบบใช้ PostgreSQL เป็นฐานข้อมูลหลัก (ไม่ใช่ SQLite แล้ว)

1. ติดตั้ง PostgreSQL บนเครื่อง production (แนะนำเวอร์ชัน 16 ขึ้นไป) — ดาวน์โหลดจาก [postgresql.org](https://www.postgresql.org/download/windows/)
2. สร้าง role และ database เฉพาะแอป (ห้ามใช้ user `postgres` กับแอปโดยตรง):
   ```sql
   CREATE ROLE maintenance_app WITH LOGIN PASSWORD '<ตั้งรหัสผ่านสุ่มยาว>';
   CREATE DATABASE maintenance_system OWNER maintenance_app;
   ```
3. จดตำแหน่งโฟลเดอร์ `bin` ของ PostgreSQL ไว้ (มี `pg_dump.exe`/`pg_restore.exe`) เช่น `C:\Program Files\PostgreSQL\18\bin` — จะใช้ตั้งค่า `PG_BIN_DIR` ในขั้นตอนถัดไป (จำเป็นสำหรับฟีเจอร์สำรอง/กู้คืนข้อมูล เพราะตัวติดตั้ง Windows ไม่ได้เพิ่มเข้า PATH ให้อัตโนมัติ)

---

## 🔐 1. ตั้งค่า Environment (`server/.env`) — สำคัญที่สุด
ระบบใช้ระบบล็อกอิน (JWT) จึง **ต้อง** ตั้งค่า environment ก่อนขึ้น production
มิฉะนั้น Server จะไม่ยอมสตาร์ท (ตั้งใจให้ fail-closed เพื่อความปลอดภัย)

1. คัดลอกไฟล์ตัวอย่าง:
   ```bash
   cd server
   cp .env.example .env
   ```
2. แก้ไข `server/.env` ให้ครบ:
   ```ini
   NODE_ENV=production
   PORT=5221
   # เปิด API ทุก endpoint โดยไม่ต้องใช้ token (มีความเสี่ยงสูงมาก)
   PUBLIC_API_MODE=1

   # ต้องเป็นค่าสุ่มยาว (เช่น openssl rand -base64 48) — ห้ามใช้ค่า default
   JWT_SECRET=<ใส่ค่าสุ่มยาวของคุณเอง>
   JWT_EXPIRES_IN=7d

   # เชื่อมต่อ PostgreSQL ที่ตั้งไว้ในขั้นตอนที่ 0
   DATABASE_URL=postgres://maintenance_app:<รหัสผ่าน>@localhost:5432/maintenance_system

   # โฟลเดอร์ bin ของ PostgreSQL (สำหรับฟีเจอร์สำรอง/กู้คืนข้อมูล)
   PG_BIN_DIR=C:\Program Files\PostgreSQL\18\bin

   # โฟลเดอร์สำรองที่อยู่นอกเครื่อง server เช่น network share หรือ cloud-sync drive
   # ระบบจะ copy และตรวจสอบขนาดไฟล์ทุกครั้งที่ backup สำเร็จ
   OFFSITE_BACKUP_DIR=\\backup-server\maintenance-system

   # PUBLIC_API_MODE=1 อนุญาตทุก origin; ถ้าปิดโหมดนี้ให้ระบุ origin ที่อนุญาต
   CORS_ORIGIN=*

   # รหัสผ่าน admin เริ่มต้น (seed เฉพาะตอนฐานข้อมูลยังไม่มี user)
   # ถ้าเว้นว่าง ระบบจะสุ่มรหัสให้และพิมพ์ลง log ตอน boot ครั้งแรก
   SEED_ADMIN_USERNAME=admin
   SEED_ADMIN_PASSWORD=<ตั้งรหัสผ่านเริ่มต้นของ admin>
   ```

> ⚠️ ไฟล์ `.env` ถูก gitignore ไว้ ต้องสร้างบนเครื่อง production เอง (ไม่ถูก deploy มากับโค้ด)

---

## 🏗️ 2. Build Frontend (เตรียมไฟล์หน้าเว็บ)
แปลงโค้ด React ให้เป็นไฟล์ Static ที่ Server จะ serve ออกไป
```bash
cd client
npm install
npm run build
```
*ระบบจะสร้าง/อัปเดตไฟล์ใน `client/dist` ซึ่ง Server จะเรียกใช้ไฟล์จากที่นี่*

> **สำคัญเรื่องไฟล์หน้าเว็บค้างหลัง deploy:** ห้ามลบ `client/dist` ก่อน build และ
> ห้ามใช้การ copy แบบ mirror (`robocopy /MIR`) กับโฟลเดอร์นี้ ระบบตั้งให้ Vite
> เก็บไฟล์ JavaScript/CSS ที่มี hash ของ release เก่าไว้ เพราะแท็บที่เปิดค้างอาจ
> ยังเรียกไฟล์เดิมอยู่ หากลบไฟล์ทันทีจะเกิด `Failed to fetch dynamically imported module`
> และหน้า error ได้ ไฟล์เก่าควร prune แยกเป็นงานบำรุงรักษาหลังพ้นช่วงการใช้งานของ
> release นั้นแล้วเท่านั้น

หลัง build ให้ตรวจว่าไม่มี asset ที่ถูกอ้างถึงหายไป:

```bash
npm run production:check
```

คำสั่งนี้ตรวจ `client/dist` และรายงานชื่อไฟล์ที่ขาด หาก deploy ไปยังเครื่องอื่นให้
คัดลอกแบบ merge (`robocopy /E`) เพื่อคง hashed assets รุ่นเก่าไว้

> ฐานข้อมูลและตารางทั้งหมดจะถูกสร้าง/อัปเกรดอัตโนมัติ (auto-migration) ตอน Server สตาร์ทครั้งแรก ไม่ต้องรัน `init-db` แยก

---

## ✅ 3. ตรวจความพร้อมก่อนขึ้น (Pre-flight check)
รันจาก **โฟลเดอร์ราก** ของโปรเจกต์:
```bash
npm run production:check
```
สคริปต์จะตรวจ `NODE_ENV`, `JWT_SECRET`, `client/dist`, dependencies, PM2 config ฯลฯ
**ต้องผ่านทุกข้อ (PASS)** ก่อนไปขั้นต่อไป

---

## 🚀 4. ติดตั้งและรันด้วย PM2 (Process Manager)
เพื่อให้ระบบรันเบื้องหลังและ restart อัตโนมัติเมื่อเกิดปัญหา

1. **ติดตั้ง PM2** (ทำครั้งเดียว):
   ```bash
   npm install pm2 -g
   ```
2. **สั่งรันด้วยไฟล์ config** จาก **โฟลเดอร์รากของโปรเจกต์**:
   ```bash
   pm2 start ecosystem.config.cjs
   ```
   > ใช้ `ecosystem.config.cjs` เท่านั้น — ไฟล์นี้ตั้ง `NODE_ENV=production`, `PORT=5221`
   > และ `max_memory_restart` ให้อัตโนมัติ **อย่าใช้ `pm2 start index.js` ตรงๆ**
   > เพราะจะไม่ได้ตั้ง `NODE_ENV=production` (ทำให้ความปลอดภัยลดลง)

---

## 🔑 5. เข้าสู่ระบบครั้งแรก
1. เปิด **http://localhost:5221**
2. ล็อกอินด้วย `admin` และรหัสที่ตั้งไว้ใน `SEED_ADMIN_PASSWORD`
   - ถ้าเว้นว่างไว้ ให้ดูรหัสสุ่มจาก log: `pm2 logs maintenance-system`
3. ระบบจะ **บังคับเปลี่ยนรหัสผ่าน** ทันทีในการล็อกอินครั้งแรก

---

## 🛠️ 6. คำสั่งที่จำเป็นของ PM2
*   **ดูสถานะ**: `pm2 status`
*   **ดู Log / Error**: `pm2 logs maintenance-system`
*   **หยุด**: `pm2 stop maintenance-system`
*   **รันใหม่**: `pm2 restart maintenance-system`
*   **ลบออกจากรายการ**: `pm2 delete maintenance-system`

> ชื่อ process คือ `maintenance-system` (กำหนดใน `ecosystem.config.cjs`)

---

## 🛡️ 7. ตั้งให้รันอัตโนมัติเมื่อเปิดเครื่อง (Windows)
1. ติดตั้ง Helper: `npm install pm2-windows-startup -g`
2. รันคำสั่งติดตั้ง: `pm2-startup install`
3. บันทึกสถานะปัจจุบัน: `pm2 save`

> หากพบ `EADDRINUSE: port 5221` ให้ตรวจ `pm2 status` ก่อน อย่าเปิด
> `node server/index.js` ซ้อนกับ process `maintenance-system`; ให้มี server ที่
> ฟัง port 5221 เพียงหนึ่งตัวเท่านั้น

---

## 🌐 8. การเข้าใช้งานจากเครื่องอื่นในเครือข่าย (LAN)
1. ตรวจสอบ IP ของเครื่อง Server (เช่น `192.168.1.50`)
2. เปิด Port **5221** ที่ Windows Firewall
3. ให้เครื่องอื่นเข้าผ่าน: `http://[IP-ของ-Server]:5221`
   - เมื่อ `PUBLIC_API_MODE=1` เว็บจากทุก origin สามารถเรียก API ได้โดยไม่ต้องใช้ token
   - ถ้าปิดโหมด public ให้ใส่ origin ที่อนุญาตใน `CORS_ORIGIN` แล้ว restart server

---

## 💾 9. การสำรอง/กู้คืนฐานข้อมูล
- ฐานข้อมูล: PostgreSQL (`DATABASE_URL` ใน `.env`) — สำรองด้วย `pg_dump` (ไฟล์ `.dump`), กู้คืนด้วย `pg_restore`
- ระบบสำรองอัตโนมัติเก็บไว้ที่ `server/database/backups/` (ทุก 24 ชม.)
- จัดการ backup/restore ได้จากหน้า **Settings** ในแอป (ต้องเป็น user สิทธิ์เต็ม) — ต้องตั้ง `PG_BIN_DIR` ไว้ก่อน (ดูขั้นตอนที่ 0-1)
- การกู้คืนจะรีสตาร์ท process อัตโนมัติหลังกู้คืนเสร็จ (ให้ PM2 restart ให้)
- ปิดการสำรองชั่วคราวได้ด้วย `DISABLE_BACKUP_SCHEDULER=1` ใน `.env`
