const request = require('supertest');
const app = require('../index');
const { query } = require('../database/db');
const bcrypt = require('bcryptjs');

describe('API Basic Endpoints', () => {
  let token = '';
  const testUsername = 'test_admin_temp';
  const testPassword = 'test_admin_temp_password';

  beforeAll(async () => {
    // Wait 1.5 seconds for migrations and seeding to complete
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create a temporary test admin user
    const hash = bcrypt.hashSync(testPassword, 10);
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active)
       VALUES ($1, $2, $3, 1, 1)
       ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name, is_full = excluded.is_full, is_active = excluded.is_active`,
      [testUsername, hash, 'Temporary Test Admin']
    );

    // Login to get token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    if (res.body && res.body.token) {
      token = res.body.token;
    }
  });

  afterAll(async () => {
    // Clean up temporary user
    await query(`DELETE FROM users WHERE username = $1`, [testUsername]);
  });

  it('should return API running message', async () => {
    const res = await request(app).get('/api');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should get inventory items', async () => {
    const req = request(app).get('/api/inventory');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    const res = await req;
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should get inventory stats', async () => {
    const req = request(app).get('/api/inventory/stats');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    const res = await req;
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('total_items');
  });
});
