# Repair System Backend

ระบบจัดการข้อมูลหลังบ้านสำหรับระบบแจ้งซ่อมและเคลมอุปกรณ์

## รายละเอียดทางเทคนิค
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (ผ่าน `pg`)
- **File Upload**: Multer

## ขั้นตอนการติดตั้ง (Installation)

1.  **เข้าสู่โฟลเดอร์ server**:
    ```bash
    cd server
    ```

2.  **ติดตั้ง dependencies**:
    ```bash
    npm install
    ```

3.  **เตรียมฐานข้อมูล**:
    - ต้องมี PostgreSQL ติดตั้งและรันอยู่ พร้อม role/database สำหรับแอป (ดู `DEPLOY.md` ขั้นตอนที่ 0)
    - ตั้งค่า `DATABASE_URL` ใน `.env` ให้ชี้ไปที่ database นั้น
    - ไม่ต้องรันคำสั่งสร้างตารางเอง — migration ใน `database/migrations-pg/` จะรันอัตโนมัติทุกครั้งที่ Server สตาร์ท

4.  **เริ่มการทำงาน (Start Server)**:
    - สำหรับโหมดพัฒนา (Development):
      ```bash
      npm start
      ```
      (หรือ `node index.js`)
    - สำหรับ Production (แนะนำใช้ PM2):
      ```bash
      cd ..
      pm2 start ecosystem.config.cjs
      ```

## การตั้งค่า (Configuration)
- เซิร์ฟเวอร์จะรันที่ Port: `5221` (สามารถแก้ไขได้ที่ `index.js`)
- ไฟล์ที่อัปโหลดจะถูกเก็บไว้ที่โฟลเดอร์ `uploads/`

## API Endpoints หลัก

API resource ทั้งหมดใช้ v2 เท่านั้นที่ `/api/v2` ดูรายการ endpoint, payload
และ response contract ได้ที่ `../API_V2.md` หรือ `GET /api-docs/v2`
