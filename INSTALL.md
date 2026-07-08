# คู่มือการติดตั้งระบบจัดการงานซ่อมและเบิกจ่ายอุปกรณ์ (Step-by-Step Guide)

คู่มือนี้จะแนะนำวิธีการติดตั้งระบบทั้งในส่วนของ Backend (Server) และ Frontend (Client) อย่างละเอียด

---

## 📋 สิ่งที่ต้องเตรียมก่อนเริ่ม (Prerequisites)

1.  **Node.js**: แนะนำเวอร์ชัน 18.x หรือสูงกว่า (สามารถตรวจสอบโดยพิมพ์ `node -v`)
2.  **npm**: มักจะมาพร้อมกับ Node.js (ตรวจสอบโดยพิมพ์ `npm -v`)
3.  **PostgreSQL**: เวอร์ชัน 16 ขึ้นไป ติดตั้งและรันอยู่ (ดูขั้นตอนที่ 0 ใน `DEPLOY.md`) — สร้าง role/database ให้แอปไว้ล่วงหน้า
4.  **พื้นที่จัดเก็บ**: ประมาณ 500MB สำหรับ dependencies

---

## 🚀 ขั้นตอนการติดตั้ง

### 1. การเตรียมโปรเจกต์
ดาวน์โหลดไฟล์โปรเจกต์หรือ Clone จาก Repository แล้วเปิด Folder โปรเจกต์ด้วย Terminal หรือ Command Prompt

---

### 2. การตั้งค่าส่วน Backend (Server)
ส่วนนี้จะทำหน้าที่จัดการฐานข้อมูลและ API

1.  **เข้าไปที่โฟลเดอร์ server**:
    ```bash
    cd server
    ```
2.  **ติดตั้ง dependencies**:
    ```bash
    npm install
    ```
3.  **ตั้งค่า Environment (`.env`)**:
    ```bash
    cp .env.example .env
    ```
    เปิดไฟล์ `.env` แล้วตั้งค่าอย่างน้อย `JWT_SECRET` (ค่าสุ่มยาว), `DATABASE_URL`
    (ชี้ไป PostgreSQL ที่เตรียมไว้), `PG_BIN_DIR` (โฟลเดอร์ bin ของ PostgreSQL สำหรับฟีเจอร์
    สำรอง/กู้คืนข้อมูล) และ `SEED_ADMIN_PASSWORD` (รหัสผ่าน admin เริ่มต้น)
    *สำหรับโหมดพัฒนา (dev) ถ้าไม่ตั้ง `.env` ระบบจะใช้ค่า fallback ให้ แต่จะเตือนใน console
    — ส่วน production ดูรายละเอียดที่ `DEPLOY.md`*

4.  **ตารางในฐานข้อมูล (อัตโนมัติ)**:
    ไม่ต้องสร้างตารางเอง — ระบบจะรัน migration และ seed บัญชี admin เริ่มต้นให้อัตโนมัติ
    ตอน Server สตาร์ทครั้งแรก (ต้องสร้าง database เปล่าไว้ล่วงหน้าตามขั้นตอนที่ 0 ใน `DEPLOY.md`)

5.  **เริ่มต้นรัน Server**:
    *   สำหรับการใช้งานทั่วไป:
        ```bash
        npm start
        ```
    *   สำหรับนักพัฒนา (Watch Mode):
        ```bash
        npm run dev
        ```
    *Server จะทำงานที่: [http://localhost:5221](http://localhost:5221)*

---

### 3. การตั้งค่าส่วน Frontend (Client)
ส่วนนี้คือหน้าจอใช้งานสำหรับ User (React Application)

1.  **เปิด Terminal ใหม่** (ห้ามปิด Terminal ของ Server) แล้วเข้าไปที่โฟลเดอร์ client:
    ```bash
    cd client
    ```
2.  **ติดตั้ง dependencies**:
    ```bash
    npm install
    ```
3.  **เริ่มต้นรัน Frontend**:
    ```bash
    npm run dev
    ```
    *Frontend จะทำงานที่: [http://localhost:5222](http://localhost:5222)*

---

## 🌐 การเข้าใช้งานระบบ

เมื่อรันครบทั้งสองส่วนแล้ว สามารถเข้าใช้งานได้ผ่านเว็บเบราว์เซอร์ที่ URL:
👉 **[http://localhost:5222](http://localhost:5222)**

### 🔑 การเข้าสู่ระบบครั้งแรก
ระบบมีระบบล็อกอิน (ผู้ใช้ + รหัสผ่าน) บัญชี admin จะถูกสร้างอัตโนมัติตอนสตาร์ทครั้งแรก
- **Username**: `admin` (หรือค่าที่ตั้งใน `SEED_ADMIN_USERNAME`)
- **Password**: ค่าที่ตั้งใน `SEED_ADMIN_PASSWORD` — ถ้าเว้นว่างไว้ ระบบจะสุ่มรหัสให้และพิมพ์ลง log
  ของ Server ตอน boot ครั้งแรก (มองหาบรรทัด `Seeded admin user ...`)
- เมื่อล็อกอินสำเร็จ ระบบจะบังคับให้ตั้งรหัสผ่านใหม่ทันที
- จัดการผู้ใช้และสิทธิ์เพิ่มเติมได้ที่หน้า **User Management** (เฉพาะผู้ใช้สิทธิ์เต็ม)

---

## 🛠 การแก้ไขปัญหาเบื้องต้น (Troubleshooting)

*   **เชื่อมต่อ PostgreSQL ไม่ได้**: ตรวจสอบว่า PostgreSQL service กำลังรันอยู่ และ `DATABASE_URL` ใน `.env` ถูกต้อง (user/password/host/port/database)
*   **ตารางในฐานข้อมูลไม่ครบ**: migration รันอัตโนมัติทุกครั้งที่ Server สตาร์ท — ดู log ตอนบูตว่ามี error หรือไม่
*   **สำรอง/กู้คืนข้อมูลใช้ไม่ได้**: ตรวจสอบว่าตั้งค่า `PG_BIN_DIR` ถูกต้องและมีไฟล์ `pg_dump.exe`/`pg_restore.exe` อยู่จริง
*   **รูปภาพไม่แสดง**: ตรวจสอบว่าในโฟลเดอร์ `server/uploads` มีอยู่จริงและมีสิทธิ์ในการเขียนไฟล์
*   **API เชื่อมต่อไม่ได้**: ตรวจสอบว่า Server (Port 5221) ทำงานอยู่หรือไม่ และไม่มี Firewall บล็อกการทำงานของ Node.js

---

## 📁 โครงสร้างโฟลเดอร์ที่สำคัญ
*   PostgreSQL (`DATABASE_URL`): ฐานข้อมูลหลัก
*   `/server/database/backups`: ไฟล์สำรองข้อมูล (`.dump`)
*   `/server/uploads`: โฟลเดอร์เก็บรูปภาพที่อัปโหลด
*   `/client/src`: โค้ดส่วนหน้าจอ (React)
