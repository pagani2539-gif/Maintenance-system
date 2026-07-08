const { query, withTransaction, closePool } = require('../database/db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// ============================================================
// Companies (multi)
// ============================================================

exports.getCompanies = async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM companies ORDER BY is_default DESC, id ASC');
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCompanyById = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query('SELECT * FROM companies WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบบริษัท' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createCompany = async (req, res) => {
  const { name_th, name_en, name_short, address, phone, email, tax_id, website } = req.body;
  if (!name_th || !name_th.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อบริษัท (ภาษาไทย)' });
  }

  try {
    const { rows: cntRows } = await query('SELECT COUNT(*) as cnt FROM companies');
    const isDefault = Number(cntRows[0].cnt) === 0 ? 1 : 0;

    const { rows } = await query(
      `INSERT INTO companies (name_th, name_en, name_short, address, phone, email, tax_id, website, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [name_th.trim(), name_en || '', name_short || '', address || '', phone || '', email || '', tax_id || '', website || '', isDefault]
    );
    res.status(201).json({ id: rows[0].id, message: 'เพิ่มบริษัทเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCompany = async (req, res) => {
  const { id } = req.params;
  const { name_th, name_en, name_short, address, phone, email, tax_id, website } = req.body;
  if (!name_th || !name_th.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อบริษัท (ภาษาไทย)' });
  }

  try {
    const result = await query(
      `UPDATE companies SET
         name_th = $1, name_en = $2, name_short = $3, address = $4, phone = $5, email = $6,
         tax_id = $7, website = $8, updated_at = NOW()
       WHERE id = $9`,
      [name_th.trim(), name_en || '', name_short || '', address || '', phone || '', email || '', tax_id || '', website || '', id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'ไม่พบบริษัท' });
    res.json({ message: 'บันทึกข้อมูลบริษัทเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCompany = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: cntRows } = await query('SELECT COUNT(*) as cnt FROM companies');
    if (Number(cntRows[0].cnt) <= 1) {
      return res.status(400).json({ error: 'ต้องมีบริษัทอย่างน้อย 1 อันในระบบ' });
    }

    const { rows: targetRows } = await query('SELECT is_default FROM companies WHERE id = $1', [id]);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'ไม่พบบริษัท' });

    // Delete logo files belonging to this company
    const { rows: logos } = await query('SELECT file_path FROM company_logos WHERE company_id = $1', [id]);
    logos.forEach((logo) => {
      const fullPath = path.join(__dirname, '..', 'uploads', logo.file_path);
      fs.unlink(fullPath, (unlinkErr) => {
        if (unlinkErr) console.warn('Failed to delete logo file:', unlinkErr.message);
      });
    });

    // Delete logos rows + company row
    await query('DELETE FROM company_logos WHERE company_id = $1', [id]);
    await query('DELETE FROM companies WHERE id = $1', [id]);

    // If we deleted the default, promote another company
    if (target.is_default) {
      const { rows: nextRows } = await query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
      if (nextRows[0]) {
        await query('UPDATE companies SET is_default = 1 WHERE id = $1', [nextRows[0].id]);
      }
    }

    res.json({ message: 'ลบบริษัทเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setDefaultCompany = async (req, res) => {
  const { id } = req.params;

  try {
    await withTransaction(async (client) => {
      await client.query('UPDATE companies SET is_default = 0');
      const result = await client.query('UPDATE companies SET is_default = 1 WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        const err = new Error('ไม่พบบริษัท');
        err.status = 404;
        throw err;
      }
    });
    res.json({ message: 'ตั้งเป็นบริษัทหลักเรียบร้อย' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ============================================================
// Logos (scoped by company)
// ============================================================

exports.getLogos = async (req, res) => {
  const { company_id } = req.query;
  try {
    let sql = 'SELECT * FROM company_logos';
    const params = [];

    if (company_id) {
      params.push(company_id);
      sql += ' WHERE company_id = $1 OR company_id IS NULL';
    }
    sql += ' ORDER BY is_default DESC, uploaded_at DESC';

    const { rows } = await query(sql, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadLogo = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });

  const { label, company_id } = req.body;
  const filePath = `logos/${req.file.filename}`;
  const logoLabel = (label && label.trim()) || `โลโก้ ${new Date().toLocaleDateString('th-TH')}`;
  const companyId = company_id ? parseInt(company_id, 10) : null;

  try {
    // Determine is_default: first logo for this company → default for that company
    const checkSql = companyId
      ? 'SELECT COUNT(*) as cnt FROM company_logos WHERE company_id = $1'
      : 'SELECT COUNT(*) as cnt FROM company_logos WHERE company_id IS NULL';
    const checkParams = companyId ? [companyId] : [];

    const { rows: cntRows } = await query(checkSql, checkParams);
    const isDefault = Number(cntRows[0].cnt) === 0 ? 1 : 0;

    const { rows } = await query(
      `INSERT INTO company_logos (label, file_path, is_default, company_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [logoLabel, filePath, isDefault, companyId]
    );

    res.status(201).json({
      id: rows[0].id,
      label: logoLabel,
      file_path: filePath,
      is_default: isDefault,
      company_id: companyId,
      message: 'อัปโหลดโลโก้เรียบร้อย',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setDefaultLogo = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: targetRows } = await query('SELECT company_id FROM company_logos WHERE id = $1', [id]);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'ไม่พบโลโก้ที่ระบุ' });

    // Default is scoped per company
    const resetSql = target.company_id
      ? 'UPDATE company_logos SET is_default = 0 WHERE company_id = $1'
      : 'UPDATE company_logos SET is_default = 0 WHERE company_id IS NULL';
    const resetParams = target.company_id ? [target.company_id] : [];

    await withTransaction(async (client) => {
      await client.query(resetSql, resetParams);
      await client.query('UPDATE company_logos SET is_default = 1 WHERE id = $1', [id]);
    });

    res.json({ message: 'ตั้งเป็นโลโก้หลักเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteLogo = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await query('SELECT file_path, is_default, company_id FROM company_logos WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบโลโก้ที่ระบุ' });

    await query('DELETE FROM company_logos WHERE id = $1', [id]);

    const fullPath = path.join(__dirname, '..', 'uploads', row.file_path);
    fs.unlink(fullPath, (unlinkErr) => {
      if (unlinkErr) console.warn('Failed to delete logo file:', unlinkErr.message);
    });

    // Promote another logo from the same company to default (if we deleted the default)
    if (row.is_default) {
      const promoteSql = row.company_id
        ? 'SELECT id FROM company_logos WHERE company_id = $1 ORDER BY uploaded_at DESC LIMIT 1'
        : 'SELECT id FROM company_logos WHERE company_id IS NULL ORDER BY uploaded_at DESC LIMIT 1';
      const promoteParams = row.company_id ? [row.company_id] : [];

      const { rows: nextRows } = await query(promoteSql, promoteParams);
      if (nextRows[0]) {
        await query('UPDATE company_logos SET is_default = 1 WHERE id = $1', [nextRows[0].id]);
      }
    }

    res.json({ message: 'ลบโลโก้เรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// System Settings (Key-Value)
// ============================================================

exports.getSystemSettings = async (req, res) => {
  try {
    const { rows } = await query('SELECT key, value FROM system_settings');
    const settings = {};
    (rows || []).forEach(r => {
      if (r.key.includes('token') && (!req.user || !req.user.is_full)) {
        settings[r.key] = '••••••••••••••••';
      } else {
        settings[r.key] = r.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSystemSettings = async (req, res) => {
  const settings = req.body || {};
  const keys = Object.keys(settings);

  if (keys.length === 0) {
    return res.json({ message: 'ไม่มีข้อมูลตั้งค่าที่ถูกอัปเดต' });
  }

  try {
    await withTransaction(async (client) => {
      for (const key of keys) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = NOW()`,
          [key, settings[key]]
        );
      }
    });
    res.json({ message: 'บันทึกการตั้งค่าระบบเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// Database Backup & Restore Manager (PostgreSQL: pg_dump / pg_restore)
// ============================================================
const { runBackup, runRestore, BACKUP_DIR } = require('../database/backupPg');

exports.getBackups = (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) {
    return res.json([]);
  }

  fs.readdir(BACKUP_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const backups = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.dump'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          created_at: stats.mtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json(backups);
  });
};

exports.createBackup = (req, res) => {
  runBackup()
    .then(filePath => {
      res.status(201).json({
        message: 'สำรองข้อมูลฐานข้อมูลสำเร็จ',
        filename: path.basename(filePath)
      });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
};

exports.deleteBackup = (req, res) => {
  const { filename } = req.params;
  if (!filename || filename.includes('..') || !filename.endsWith('.dump') || !filename.startsWith('backup_')) {
    return res.status(400).json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });
  }

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์สำรองข้อมูล' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'ลบไฟล์สำรองข้อมูลเรียบร้อย' });
  });
};

exports.downloadBackup = (req, res) => {
  const { filename } = req.params;
  if (!filename || filename.includes('..') || !filename.endsWith('.dump') || !filename.startsWith('backup_')) {
    return res.status(400).json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });
  }

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์สำรองข้อมูล' });
  }

  res.download(filePath, filename);
};

exports.restoreBackup = async (req, res) => {
  const { filename, password, confirm_text } = req.body;

  if (!filename || filename.includes('..') || !filename.endsWith('.dump') || !filename.startsWith('backup_')) {
    return res.status(400).json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเพื่อยืนยันสิทธิ์' });
  }
  if (confirm_text !== 'RESTORE') {
    return res.status(400).json({ error: 'กรุณาพิมพ์คำว่า RESTORE เพื่อยืนยัน' });
  }

  const backupPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์สำรองข้อมูล' });
  }

  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });

    // v1 restore strategy: run pg_restore, then exit and let PM2 restart the
    // process so every module gets a fresh connection pool. A live pool
    // reconnect without restart is a possible future refinement, but this
    // matches the previously known-good "restore then restart" behavior and
    // is the lower-risk choice for the first Postgres-backed restore path.
    await runRestore(backupPath);

    console.log('Database restored successfully. Restarting server to apply changes...');
    res.json({ message: 'กู้คืนฐานข้อมูลสำเร็จแล้ว ระบบกำลังรีสตาร์ทเซิร์ฟเวอร์ใน 1 วินาที...' });

    setTimeout(async () => {
      try { await closePool(); } catch { /* ignore — process is exiting anyway */ }
      process.exit(0);
    }, 1000);
  } catch (err) {
    console.error('Restore failed:', err.message);
    res.status(500).json({ error: 'ไม่สามารถกู้คืนฐานข้อมูลได้: ' + err.message });
  }
};
