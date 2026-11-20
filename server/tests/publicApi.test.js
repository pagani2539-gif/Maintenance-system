process.env.NODE_ENV = 'development';
process.env.PUBLIC_API_MODE = '1';

const request = require('supertest');
const app = require('../index');

describe('Public API mode', () => {
  it('allows protected read endpoints without a token', async () => {
    const res = await request(app).get('/api/v2/inventory');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('allows full-user endpoints without a token', async () => {
    const res = await request(app).get('/api/v2/users');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns a synthetic public actor from /api/v2/auth/me', async () => {
    const res = await request(app).get('/api/v2/auth/me');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user).toMatchObject({
      username: 'public-api',
      fullName: 'Public API',
      isPublic: true,
    });
  });

  it('allows browser preflight requests from any origin', async () => {
    const res = await request(app)
      .options('/api/v2/inventory')
      .set('Origin', 'https://external.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
