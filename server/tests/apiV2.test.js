const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../index');
const { query } = require('../database/db');
const openApiV2 = require('../openapi/v2');

const expectedV2Operations = {
  '/auth/login': ['post'],
  '/auth/me': ['get'],
  '/auth/password': ['post'],
  '/repairs': ['get', 'post'],
  '/repairs/stats': ['get'],
  '/repairs/dashboard-stats': ['get'],
  '/repairs/unread-count': ['get'],
  '/repairs/{id}': ['get', 'patch', 'delete'],
  '/repairs/{id}/actions/status-transition': ['post'],
  '/repairs/{id}/actions/mark-read': ['post'],
  '/repairs/{id}/actions/replace-device': ['post'],
  '/claims': ['get', 'post'],
  '/claims/{id}': ['get', 'patch', 'delete'],
  '/claims/{id}/actions/status-transition': ['post'],
  '/claims/{id}/actions/mark-read': ['post'],
  '/claims/{id}/actions/replace-device': ['post'],
  '/inventory': ['get', 'post'],
  '/inventory/stats': ['get'],
  '/inventory/reports/lifecycle': ['get'],
  '/inventory/lifecycle-report': ['get'],
  '/inventory/adjustments': ['get'],
  '/inventory/{id}': ['get', 'patch', 'delete'],
  '/inventory/{id}/instances': ['get', 'post'],
  '/inventory/{id}/adjustments': ['post'],
  '/inventory/instances/{instanceId}/timeline': ['get'],
  '/inventory/instances/{instanceId}': ['patch'],
  '/inventory/imports': ['post'],
  '/inventory-adjustments/{adjustmentId}/actions/approve': ['post'],
  '/inventory-adjustments/{adjustmentId}/actions/reject': ['post'],
  '/withdrawals': ['get', 'post'],
  '/withdrawals/{id}': ['get', 'patch', 'delete'],
  '/withdrawals/{id}/items/{itemId}': ['patch'],
  '/returns': ['post'],
  '/transactions': ['get'],
  '/transactions/latest': ['get'],
  '/transactions/{id}': ['delete'],
  '/purchase-orders': ['get', 'post'],
  '/purchase-orders/vendors': ['get'],
  '/purchase-orders/{id}': ['get', 'patch', 'delete'],
  '/purchase-orders/{id}/receipts': ['post'],
  '/purchase-orders/actions/auto-generate': ['post'],
  '/search': ['get'],
  '/reports/summary/counts': ['get'],
  '/reports/{type}': ['get'],
  '/stations/details': ['get'],
  '/stations': ['get', 'post'],
  '/stations/{id}': ['get', 'patch', 'delete'],
  '/stations/{stationId}/assets/{inventoryId}': ['patch'],
  '/stations/{id}/actions/verify': ['post'],
  '/stations/{id}/asset-movements': ['post'],
  '/contracts': ['get', 'post'],
  '/contracts/{id}': ['get', 'patch', 'delete'],
  '/settings/companies': ['get', 'post'],
  '/settings/companies/{id}': ['get', 'patch', 'delete'],
  '/settings/companies/{id}/actions/set-default': ['post'],
  '/settings/logos': ['get', 'post'],
  '/settings/logos/{id}/actions/set-default': ['post'],
  '/settings/logos/{id}': ['delete'],
  '/settings/system': ['get', 'patch'],
  '/settings/backups': ['get', 'post'],
  '/settings/backups/{filename}': ['delete'],
  '/settings/backups/download/{filename}': ['get'],
  '/settings/backups/actions/restore': ['post'],
  '/users/audit-logs': ['get'],
  '/users': ['get', 'post'],
  '/users/{id}': ['get', 'patch', 'delete'],
  '/stock-counts': ['get', 'post'],
  '/stock-counts/{id}': ['get'],
  '/stock-counts/{id}/items/{itemId}': ['patch'],
  '/stock-counts/{id}/actions/complete': ['post'],
  '/stock-counts/{id}/actions/cancel': ['post'],
  '/technicians': ['get', 'post'],
  '/technicians/{id}': ['get', 'patch'],
  '/technician-stock/holdings': ['get'],
  '/technician-stock/movements': ['get'],
  '/technician-stock/actions/load': ['post'],
  '/technician-stock/actions/install': ['post'],
  '/technician-stock/actions/return': ['post'],
  '/technician-stock/movements/{id}': ['delete'],
};

describe('API v2 contract', () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = `api_v2_${suffix}`;
  const password = 'api_v2_password_123';
  const stationName = `API v2 station ${suffix}`;
  let token;
  let stationId;
  let conflictStationId;
  let repairId;

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active)
       VALUES ($1, $2, $3, 1, 1)`,
      [username, hash, 'API v2 Test Admin']
    );

    const login = await request(app)
      .post('/api/v2/auth/login')
      .send({ username, password });
    token = login.body.data.token;
  });

  afterAll(async () => {
    if (repairId) {
      await query('DELETE FROM audit_logs WHERE entity_type = $1 AND entity_id = $2', ['repair', repairId]);
      await query('DELETE FROM repair_images WHERE repair_id = $1', [repairId]);
      await query('DELETE FROM repair_logs WHERE repair_id = $1', [repairId]);
      await query('DELETE FROM repairs WHERE id = $1', [repairId]);
    }
    for (const id of [stationId, conflictStationId].filter(Boolean)) {
      await query('DELETE FROM audit_logs WHERE entity_type = $1 AND entity_id = $2', ['station', id]);
      await query('DELETE FROM stations WHERE id = $1', [id]);
    }
    await query('DELETE FROM users WHERE username = $1', [username]);
  });

  it('returns a stable error envelope and request id', async () => {
    const response = await request(app)
      .post('/api/v2/auth/login')
      .send({ username });

    expect(response.statusCode).toBe(422);
    expect(response.headers['x-request-id']).toMatch(/^req_/);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body.error.details[0].field).toBe('password');
  });

  it('wraps paginated list responses', async () => {
    const response = await request(app)
      .get('/api/v2/inventory?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(1);
    expect(response.body.meta).toMatchObject({
      page: 1,
      pageSize: 1,
      total: expect.any(Number),
      totalPages: expect.any(Number),
      requestId: expect.any(String),
    });
  });

  it('keeps dashboard statistics collections present in the v2 response contract', async () => {
    const response = await request(app)
      .get('/api/v2/repairs/dashboard-stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toMatchObject({
      inventory: expect.objectContaining({
        topUsed: expect.any(Array),
        leastUsed: expect.any(Array),
        criticalItems: expect.any(Array),
        recentTransactions: expect.any(Array),
        recentWithdrawals: expect.any(Array),
      }),
      analysis: expect.objectContaining({
        mostBroken: expect.any(Array),
        overdue: expect.any(Array),
        monthlyTrend: expect.any(Array),
      }),
      people: expect.objectContaining({
        topRecipients: expect.any(Array),
        pendingReturns: expect.any(Array),
        pendingReturnsCount: expect.any(Number),
      }),
      purchaseOrders: expect.objectContaining({
        totalPo: expect.any(Number),
        pendingPo: expect.any(Number),
        receivedPo: expect.any(Number),
      }),
      stockMovements: expect.any(Array),
      withdrawalBreakdown: expect.any(Array),
      inventoryConditions: expect.any(Array),
    });
  });

  it('accepts camelCase payloads and deduplicates an idempotent write', async () => {
    const payload = {
      name: stationName,
      stationType: 'WEIGH_STATION',
      highwayNo: '9',
      direction: 'BOTH',
      region: 'ภาคกลาง',
      province: 'กาญจนบุรี',
      responsiblePerson: 'API v2 Test Admin',
      gpsCoordinates: '14.1083611,99.7096389',
    };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `station-${suffix}`,
    };

    const first = await request(app).post('/api/v2/stations').set(headers).send(payload);
    const second = await request(app).post('/api/v2/stations').set(headers).send(payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.body.data).toMatchObject({
      name: stationName,
      stationType: 'WEIGH_STATION',
      latitude: 14.1083611,
      longitude: 99.7096389,
    });
    expect(second.body).toEqual(first.body);
    stationId = first.body.data.id;
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const key = `conflict-${suffix}`;
    const base = {
      name: `${stationName} conflict`,
      stationType: 'WEIGH_STATION',
      highwayNo: '9',
      direction: 'BOTH',
      region: 'ภาคกลาง',
      province: 'กาญจนบุรี',
      responsiblePerson: 'API v2 Test Admin',
      gpsCoordinates: '14.1083611,99.7096389',
    };
    const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': key };
    const first = await request(app).post('/api/v2/stations').set(headers).send(base);
    const second = await request(app).post('/api/v2/stations').set(headers).send({ ...base, name: `${base.name} changed` });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    conflictStationId = first.body.data.id;
  });

  it('accepts the v2 multipart payload contract', async () => {
    const response = await request(app)
      .post('/api/v2/repairs')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `repair-${suffix}`)
      .field('payload', JSON.stringify({
        location: stationName,
        stationId,
        deviceName: 'API v2 test device',
        problem: 'API v2 multipart test',
        priority: 'ปกติ',
        receivedAt: new Date().toISOString(),
      }));

    expect(response.statusCode).toBe(201);
    expect(response.body.data).toMatchObject({ id: expect.anything(), ticketNo: expect.stringMatching(/^RP-/) });
    repairId = response.body.data.id;
  });

  it('serves the OpenAPI document for v2', async () => {
    const response = await request(app).get('/api-docs/v2');
    expect(response.statusCode).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths['/repairs']).toBeDefined();
    expect(response.body.components.schemas.LoginRequest).toBeDefined();
  });

  it('documents every registered v2 path and method', () => {
    const documentedOperations = Object.entries(expectedV2Operations)
      .reduce((count, [path, methods]) => count + methods.filter((method) => (
        openApiV2.paths[path] && openApiV2.paths[path][method]
      )).length, 0);
    const registeredOperations = Object.values(expectedV2Operations)
      .reduce((count, methods) => count + methods.length, 0);

    expect(Object.keys(openApiV2.paths)).toEqual(expect.arrayContaining(Object.keys(expectedV2Operations)));
    expect(documentedOperations).toBe(registeredOperations);
    expect(registeredOperations).toBe(113);
  });

  it('removes v1 resource endpoints without redirecting or falling back to the SPA', async () => {
    const requests = [
      request(app).post('/api/auth/login').send({ username, password }),
      request(app).get('/api/inventory'),
      request(app).get('/api/repairs'),
    ];
    for (const pending of requests) {
      const response = await pending;
      expect(response.statusCode).toBe(404);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
        requestId: response.headers['x-request-id'],
      });
      expect(response.headers.deprecation).toBeUndefined();
      expect(response.headers.link).toBeUndefined();
    }
  });

  it('serves v2 markdown documentation from the unversioned docs endpoint', async () => {
    const response = await request(app).get('/api-docs');
    expect(response.statusCode).toBe(200);
    expect(response.text).toContain('Base URL: `/api/v2`');
    expect(response.text).not.toContain('/api/inventory');
  });
});
