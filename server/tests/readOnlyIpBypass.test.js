const {
  requireAuth,
  requireFull,
  requireAdmin,
  isReadOnlyIpBypassRequest,
} = require('../middlewares/auth');

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_API_MODE: process.env.PUBLIC_API_MODE,
  READ_ONLY_IP_BYPASS: process.env.READ_ONLY_IP_BYPASS,
  READ_ONLY_IPS: process.env.READ_ONLY_IPS,
};

const makeResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };
  return response;
};

const makeRequest = (method, remoteAddress, headers = {}) => ({
  method,
  socket: { remoteAddress },
  headers,
});

const runMiddleware = async (middleware, req) => {
  const res = makeResponse();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
};

describe('read-only IP bypass', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_API_MODE = '0';
    process.env.READ_ONLY_IP_BYPASS = '1';
    process.env.READ_ONLY_IPS = '192.168.2.64';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('recognizes only GET requests from the configured direct IP', () => {
    expect(isReadOnlyIpBypassRequest(makeRequest('GET', '192.168.2.64'))).toBe(true);
    expect(isReadOnlyIpBypassRequest(makeRequest('POST', '192.168.2.64'))).toBe(false);
    expect(isReadOnlyIpBypassRequest(makeRequest('GET', '192.168.2.65'))).toBe(false);
  });

  it('accepts IPv4-mapped loopback representation of the allowed IP', () => {
    expect(isReadOnlyIpBypassRequest(makeRequest('GET', '::ffff:192.168.2.64'))).toBe(true);
  });

  it('does not trust X-Forwarded-For to grant access', () => {
    const req = makeRequest('GET', '192.168.2.65', {
      'x-forwarded-for': '192.168.2.64',
    });
    expect(isReadOnlyIpBypassRequest(req)).toBe(false);
  });

  it('allows a read request without JWT and attaches a non-admin test actor', async () => {
    const result = await runMiddleware(requireAuth, makeRequest('GET', '192.168.2.64'));

    expect(result.nextCalled).toBe(true);
    expect(result.req.user).toMatchObject({
      username: 'read-only-ip-test',
      is_public: true,
      is_full: false,
    });
  });

  it('keeps write requests protected even from the allowed IP', async () => {
    const result = await runMiddleware(requireAuth, makeRequest('POST', '192.168.2.64'));

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(401);
  });

  it('keeps Admin-protected reads blocked for the test actor', async () => {
    const req = makeRequest('GET', '192.168.2.64');
    await runMiddleware(requireAuth, req);

    const fullResult = await runMiddleware(requireFull, req);
    const adminResult = await runMiddleware(requireAdmin, req);

    expect(fullResult.res.statusCode).toBe(403);
    expect(adminResult.res.statusCode).toBe(403);
  });

  it('keeps an unlisted IP protected', async () => {
    const result = await runMiddleware(requireAuth, makeRequest('GET', '192.168.2.65'));

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(401);
  });

  it('returns to normal JWT protection when the bypass is disabled', async () => {
    process.env.READ_ONLY_IP_BYPASS = '0';

    const result = await runMiddleware(requireAuth, makeRequest('GET', '192.168.2.64'));

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(401);
  });
});
