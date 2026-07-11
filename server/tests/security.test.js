const request = require('supertest');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const app = require('../index');
const { ready } = require('../database/initPg');
const { query } = require('../database/db');

describe('Authorization and upload security', () => {
  const password = 'security-test-password';
  const users = {
    unprivileged: 'security_unprivileged_user',
    manager: 'security_manager_user',
  };
  const createdStationIds = [];
  const createdLogos = [];
  let unprivilegedToken = '';
  let managerToken = '';

  beforeAll(async () => {
    await ready;
    const hash = await bcrypt.hash(password, 4);
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active, permissions)
       VALUES ($1, $2, $3, 0, 1, $4)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = excluded.password_hash, full_name = excluded.full_name,
           is_full = excluded.is_full, is_active = excluded.is_active, permissions = excluded.permissions`,
      [users.unprivileged, hash, 'Security Unprivileged', '{}']
    );
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active, permissions)
       VALUES ($1, $2, $3, 0, 1, $4)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = excluded.password_hash, full_name = excluded.full_name,
           is_full = excluded.is_full, is_active = excluded.is_active, permissions = excluded.permissions`,
      [users.manager, hash, 'Security Manager', JSON.stringify({ manage: { stations: true, companies: true } })]
    );

    const [unprivileged, manager] = await Promise.all([
      request(app).post('/api/auth/login').send({ username: users.unprivileged, password }),
      request(app).post('/api/auth/login').send({ username: users.manager, password }),
    ]);
    unprivilegedToken = unprivileged.body.token;
    managerToken = manager.body.token;
  });

  afterAll(async () => {
    for (const id of createdStationIds) await query('DELETE FROM stations WHERE id = $1', [id]);
    for (const logo of createdLogos) {
      await query('DELETE FROM company_logos WHERE id = $1', [logo.id]);
      await fs.promises.unlink(path.join(__dirname, '../uploads', logo.filePath)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    await query('DELETE FROM users WHERE username = ANY($1)', [[users.unprivileged, users.manager]]);
  });

  const stationPayload = (name) => ({
    name,
    station_type: 'WIM',
    highway_no: '1',
    direction: 'INBOUND',
    region: 'central',
    province: 'Bangkok',
    responsible_person: 'Security Test',
  });

  it('rejects station creation without manage.stations permission', async () => {
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', `Bearer ${unprivilegedToken}`)
      .send(stationPayload(`Forbidden station ${Date.now()}`));

    expect(res.statusCode).toBe(403);
  });

  it('allows station creation with manage.stations permission', async () => {
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(stationPayload(`Allowed station ${Date.now()}`));

    expect(res.statusCode).toBe(201);
    createdStationIds.push(res.body.id);
  });

  it('rejects HTML masquerading as a PNG upload', async () => {
    const res = await request(app)
      .post('/api/settings/logos')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('logo', Buffer.from('<script>window.xss = true</script>'), {
        filename: 'payload.html',
        contentType: 'image/png',
      });

    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid PNG image', async () => {
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3VwAAAABJRU5ErkJggg==',
      'base64'
    );
    const res = await request(app)
      .post('/api/settings/logos')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('logo', onePixelPng, { filename: 'logo.png', contentType: 'image/png' });

    expect(res.statusCode).toBe(201);
    expect(res.body.file_path).toMatch(/^logos\/logo-[\w-]+\.png$/);
    createdLogos.push({ id: res.body.id, filePath: res.body.file_path });
  });

  it('rejects company-logo uploads without manage.companies permission', async () => {
    const res = await request(app)
      .post('/api/settings/logos')
      .set('Authorization', `Bearer ${unprivilegedToken}`)
      .attach('logo', Buffer.from('not-an-image'), { filename: 'logo.png', contentType: 'image/png' });

    expect(res.statusCode).toBe(403);
  });

  it('blocks repeated failed logins for the same username', async () => {
    const username = `rate_limit_${Date.now()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request(app).post('/api/auth/login').send({ username, password: 'wrong-password' });
      expect(res.statusCode).toBe(401);
    }

    const blocked = await request(app).post('/api/auth/login').send({ username, password: 'wrong-password' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
