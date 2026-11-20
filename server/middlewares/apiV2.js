const crypto = require('crypto');

const MAX_PAGE_SIZE = 100;

const camelToSnake = (key) => String(key).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const snakeToCamel = (key) => String(key).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

const mapKeys = (value, mapper) => {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, mapper));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [mapper(key), mapKeys(item, mapper)])
  );
};

const toLegacyBody = (body) => mapKeys(body || {}, camelToSnake);
const toApiBody = (body) => mapKeys(body, snakeToCamel);

// Some legacy controllers intentionally use camelCase query names. Keep those
// names stable while converting the remaining v2 query names for controllers.
const LEGACY_CAMEL_QUERY_KEYS = new Set(['sortBy', 'startDate', 'endDate']);
const toLegacyQuery = (query) => Object.fromEntries(
  Object.entries(query || {}).map(([key, value]) => [
    LEGACY_CAMEL_QUERY_KEYS.has(key) ? key : camelToSnake(key),
    value,
  ])
);

const requestId = (req, res, next) => {
  const supplied = String(req.get('X-Request-Id') || '').trim();
  req.requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : `req_${crypto.randomUUID()}`;
  res.set('X-Request-Id', req.requestId);
  next();
};

const parseBoolean = (value) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

const pagination = (req, res, next) => {
  const rawPage = req.query.page === undefined ? 1 : Number(req.query.page);
  const rawPageSize = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);
  if (!Number.isInteger(rawPage) || rawPage <= 0 || !Number.isInteger(rawPageSize) || rawPageSize <= 0) {
    const error = new Error('page และ pageSize ต้องเป็นจำนวนเต็มที่มากกว่า 0');
    error.statusCode = 422;
    error.code = 'VALIDATION_ERROR';
    error.details = [{ field: 'query', reason: 'page/pageSize ไม่ถูกต้อง' }];
    return next(error);
  }
  const page = rawPage;
  const pageSize = rawPageSize;

  req.v2Pagination = {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
  req.query = {
    ...req.query,
    page: String(page),
    pageSize: String(pageSize),
  };
  next();
};

const parseMultipartPayload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();

  const rawPayload = req.body?.payload;
  if (rawPayload == null || rawPayload === '') {
    const error = new Error('กรุณาระบุ multipart field ชื่อ payload เป็น JSON');
    error.statusCode = 400;
    error.code = 'MULTIPART_PAYLOAD_REQUIRED';
    return next(error);
  }

  try {
    const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('payload ต้องเป็น JSON object');
    }
    req.body = parsed;
    return next();
  } catch (error) {
    error.statusCode = 400;
    error.code = 'INVALID_MULTIPART_PAYLOAD';
    error.message = 'รูปแบบ multipart payload ไม่ถูกต้อง';
    return next(error);
  }
};

const normalizeLegacyRequest = (req, _res, next) => {
  req.body = toLegacyBody(req.body);
  req.query = toLegacyQuery(req.query);
  next();
};

const validate = (schema, source = 'body') => (req, _res, next) => {
  const input = source === 'body' && req[source] === undefined ? {} : req[source];
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new Error('ข้อมูลไม่ถูกต้อง');
    error.statusCode = 422;
    error.code = 'VALIDATION_ERROR';
    error.details = result.error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join('.') : source,
      reason: issue.message,
    }));
    return next(error);
  }
  req[source] = result.data;
  next();
};

const responseContract = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.locals.v2SkipWrap) return originalJson(body);

    if (body?.error && typeof body.error === 'object') {
      res.locals.v2Envelope = body;
      return originalJson(body);
    }

    if (res.statusCode >= 400 || (body && body.error)) {
      const errorValue = body?.error;
      const error = {
        code: body?.code || 'API_ERROR',
        message: typeof errorValue === 'string' ? errorValue : (body?.message || 'คำขอไม่สำเร็จ'),
        details: body?.details || [],
        requestId: req.requestId,
      };
      const envelope = { error };
      res.locals.v2Envelope = envelope;
      return originalJson(envelope);
    }

    const source = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : body;
    const meta = { requestId: req.requestId };
    let data = source;

    if (source && !Array.isArray(source) && typeof source === 'object' && 'message' in source) {
      meta.message = source.message;
      delete source.message;
      data = Object.keys(source).length ? source : null;
    }

    if (Array.isArray(data)) {
      const total = data.length;
      const page = req.v2Pagination?.page || 1;
      const pageSize = req.v2Pagination?.pageSize || 25;
      const offset = req.v2Pagination?.offset || 0;
      data = data.slice(offset, offset + pageSize);
      Object.assign(meta, {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        hasNextPage: offset + data.length < total,
      });
    } else if (!req.v2Pagination?.skipResponseSlicing
      && data && !Array.isArray(data) && typeof data === 'object' && Array.isArray(data.logs)) {
      const total = Number(data.total) || data.logs.length;
      const page = req.v2Pagination?.page || 1;
      const pageSize = req.v2Pagination?.pageSize || 25;
      const offset = req.v2Pagination?.offset || 0;
      data.logs = data.logs.slice(offset, offset + pageSize);
      Object.assign(meta, {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        hasNextPage: offset + data.logs.length < total,
      });
    }

    const envelope = { data: toApiBody(data), meta };
    res.locals.v2Envelope = envelope;
    return originalJson(envelope);
  };

  next();
};

const v2Error = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const statusCode = err.statusCode || err.status || 500;
  const details = err.details || [];
  const envelope = {
    error: {
      code: err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'API_ERROR'),
      message: statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
        : (err.message || 'คำขอไม่สำเร็จ'),
      details,
      requestId: req.requestId || `req_${crypto.randomUUID()}`,
    },
  };
  if (statusCode >= 500) console.error('API v2 Error:', err);
  return res.status(statusCode).json(envelope);
};

const parseIdempotencyKey = (req) => String(req.get('Idempotency-Key') || '').trim();

module.exports = {
  MAX_PAGE_SIZE,
  camelToSnake,
  snakeToCamel,
  mapKeys,
  toLegacyBody,
  toApiBody,
  toLegacyQuery,
  requestId,
  pagination,
  parseBoolean,
  parseMultipartPayload,
  normalizeLegacyRequest,
  validate,
  responseContract,
  v2Error,
  parseIdempotencyKey,
};
