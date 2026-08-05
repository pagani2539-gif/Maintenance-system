const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Maintenance System API',
    version: '1.0.0',
    description: 'เอกสาร API สำหรับระบบบริหารงานซ่อมและคลังอุปกรณ์',
  },
  servers: [
    { url: 'http://localhost:5221', description: 'Local server' },
  ],
  tags: [
    { name: 'System', description: 'สถานะระบบ' },
    { name: 'Auth', description: 'การเข้าสู่ระบบ' },
    { name: 'Stations', description: 'สถานี' },
    { name: 'Inventory', description: 'คลังอุปกรณ์' },
    { name: 'Repairs', description: 'งานซ่อม' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['System'], summary: 'ตรวจสอบสถานะ server และ database',
        responses: { 200: { description: 'ระบบพร้อมใช้งาน' }, 503: { description: 'ระบบไม่พร้อมใช้งาน' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'เข้าสู่ระบบ',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' } } } } } },
        responses: { 200: { description: 'เข้าสู่ระบบสำเร็จ' }, 400: { description: 'ข้อมูลไม่ครบ' }, 401: { description: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'], summary: 'ดูข้อมูลผู้ใช้ปัจจุบัน', security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'ข้อมูลผู้ใช้' }, 401: { description: 'ไม่ได้รับอนุญาต' } },
      },
    },
    '/api/stations': {
      get: {
        tags: ['Stations'], summary: 'รายการสถานี', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'รายการสถานี' }, 401: { description: 'ไม่ได้รับอนุญาต' } },
      },
    },
    '/api/inventory': {
      get: {
        tags: ['Inventory'], summary: 'รายการอุปกรณ์', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'รายการอุปกรณ์' }, 401: { description: 'ไม่ได้รับอนุญาต' } },
      },
    },
    '/api/repairs': {
      get: {
        tags: ['Repairs'], summary: 'รายการงานซ่อม', security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'รายการงานซ่อม' }, 401: { description: 'ไม่ได้รับอนุญาต' } },
      },
    },
  },
};

module.exports = openapiDocument;
