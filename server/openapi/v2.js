const { z } = require('zod');
const v2Schemas = require('../schemas/v2');

const schemaFromZod = (schema) => {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  return jsonSchema;
};

const ref = (name) => ({ $ref: '#/components/schemas/' + name });
const parameterRef = (name) => ({ $ref: '#/components/parameters/' + name });

const jsonResponse = (description = 'API v2 response') => ({
  description,
  content: {
    'application/json': {
      schema: ref('ApiResponse'),
    },
  },
});

const fileResponse = {
  description: 'Binary file download',
  content: {
    'application/octet-stream': {
      schema: { type: 'string', format: 'binary' },
    },
  },
};

const errorResponse = (description = 'API error') => ({
  description,
  content: {
    'application/json': {
      schema: ref('ApiErrorResponse'),
    },
  },
});

const operationResponses = (success = 200, options = {}) => {
  const responses = {
    [success]: options.file ? fileResponse : jsonResponse(),
    400: errorResponse('Bad request'),
    401: errorResponse('Unauthenticated'),
    403: errorResponse('Forbidden'),
    404: errorResponse('Not found'),
    409: errorResponse('Conflict'),
    422: errorResponse('Validation error'),
  };
  delete responses[success];
  responses[success] = options.file ? fileResponse : jsonResponse();
  return responses;
};

const operation = (summary, options = {}) => {
  const {
    tags = ['General'],
    parameters = [],
    queryParameters = [],
    bodySchema,
    bodyContent = 'application/json',
    bodyRequired = true,
    idempotent = false,
    success = 200,
    publicOperation = false,
    file = false,
    description,
  } = options;

  const allParameters = [...parameters, ...queryParameters];
  if (idempotent) allParameters.push(parameterRef('IdempotencyKey'));

  const result = {
    summary,
    tags,
    responses: operationResponses(success, { file }),
  };

  if (description) result.description = description;
  if (allParameters.length) result.parameters = allParameters;
  if (bodySchema) {
    result.requestBody = {
      required: bodyRequired,
      content: {
        [bodyContent]: {
          schema: ref(bodySchema),
        },
      },
    };
  }
  if (publicOperation) result.security = [];
  return result;
};

const pathParam = (name, type = 'integer') => ({
  name,
  in: 'path',
  required: true,
  schema: type === 'integer' ? { type: 'integer', format: 'int64', minimum: 1 } : { type },
});

const queryParam = (name, schema, description) => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description ? { description } : {}),
});

const requiredQueryParam = (name, schema, description) => ({
  ...queryParam(name, schema, description),
  required: true,
});

const paginationParameters = [
  parameterRef('Page'),
  parameterRef('PageSize'),
  parameterRef('Query'),
  parameterRef('SortBy'),
  parameterRef('SortOrder'),
];

const dateParameters = [
  queryParam('startDate', { type: 'string', format: 'date' }, 'วันที่เริ่มต้นรูปแบบ YYYY-MM-DD'),
  queryParam('endDate', { type: 'string', format: 'date' }, 'วันที่สิ้นสุดรูปแบบ YYYY-MM-DD'),
];

const statusParameter = queryParam('status', { type: 'string' }, 'กรองตามสถานะ');
const stationIdParameter = queryParam('stationId', { type: 'integer', format: 'int64', minimum: 1 }, 'กรองตามสถานี');
const technicianIdParameter = queryParam('technicianId', { type: 'integer', format: 'int64', minimum: 1 }, 'กรองตามช่าง');
const inventoryIdParameter = queryParam('inventoryId', { type: 'integer', format: 'int64', minimum: 1 }, 'กรองตามอุปกรณ์');

const list = (summary, tags, options = {}) => operation(summary, {
  tags,
  queryParameters: paginationParameters,
  ...options,
});

const detail = (summary, tags, idName = 'id', options = {}) => operation(summary, {
  tags,
  parameters: [pathParam(idName)],
  ...options,
});

const action = (summary, tags, parameters, bodySchema = 'EmptyRequest', options = {}) => operation(summary, {
  tags,
  parameters,
  bodySchema,
  idempotent: true,
  ...options,
});

const paths = {
  '/auth/login': {
    post: operation('เข้าสู่ระบบ', {
      tags: ['Authentication'],
      bodySchema: 'LoginRequest',
      publicOperation: true,
      description: 'รับ username/password และคืน JWT access token',
    }),
  },
  '/auth/me': {
    get: operation('ดูข้อมูลผู้ใช้ปัจจุบัน', { tags: ['Authentication'] }),
  },
  '/auth/password': {
    post: operation('เปลี่ยนรหัสผ่าน', {
      tags: ['Authentication'],
      bodySchema: 'ChangePasswordRequest',
    }),
  },

  '/repairs': {
    get: list('รายการงานซ่อม', ['Repairs']),
    post: operation('สร้างงานซ่อม', {
      tags: ['Repairs'],
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      idempotent: true,
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
  },
  '/repairs/stats': {
    get: operation('สถิติงานซ่อม', { tags: ['Repairs'] }),
  },
  '/repairs/dashboard-stats': {
    get: operation('สถิติ dashboard งานซ่อม', { tags: ['Repairs'], queryParameters: dateParameters }),
  },
  '/repairs/unread-count': {
    get: operation('จำนวนงานซ่อมที่ยังไม่อ่าน', { tags: ['Repairs'] }),
  },
  '/repairs/{id}': {
    get: detail('ดูงานซ่อม', ['Repairs']),
    patch: detail('แก้ไขงานซ่อมบางฟิลด์', ['Repairs'], 'id', { bodySchema: 'RepairRequest' }),
    delete: detail('ลบงานซ่อม', ['Repairs'], 'id'),
  },
  '/repairs/{id}/actions/status-transition': {
    post: action('เปลี่ยนสถานะงานซ่อม', ['Repairs'], [pathParam('id')], 'StatusTransitionRequest'),
  },
  '/repairs/{id}/actions/mark-read': {
    post: action('อ่านงานซ่อม', ['Repairs'], [pathParam('id')]),
  },
  '/repairs/{id}/actions/replace-device': {
    post: action('เปลี่ยนอุปกรณ์ในงานซ่อม', ['Repairs'], [pathParam('id')], 'ReplacementRequest'),
  },

  '/claims': {
    get: list('รายการเคลม', ['Claims']),
    post: operation('สร้างเคลม', {
      tags: ['Claims'],
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      idempotent: true,
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
  },
  '/claims/{id}': {
    get: detail('ดูเคลม', ['Claims']),
    patch: detail('แก้ไขเคลมบางฟิลด์', ['Claims'], 'id', { bodySchema: 'RepairRequest' }),
    delete: detail('ลบเคลม', ['Claims']),
  },
  '/claims/{id}/actions/status-transition': {
    post: action('เปลี่ยนสถานะเคลม', ['Claims'], [pathParam('id')], 'StatusTransitionRequest'),
  },
  '/claims/{id}/actions/mark-read': {
    post: action('อ่านเคลม', ['Claims'], [pathParam('id')]),
  },
  '/claims/{id}/actions/replace-device': {
    post: action('เปลี่ยนอุปกรณ์ในเคลม', ['Claims'], [pathParam('id')], 'ReplacementRequest'),
  },

  '/inventory': {
    get: list('รายการอุปกรณ์', ['Inventory']),
    post: operation('สร้างอุปกรณ์', {
      tags: ['Inventory'],
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      idempotent: true,
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
  },
  '/inventory/stats': {
    get: operation('สถิติคลังอุปกรณ์', { tags: ['Inventory'] }),
  },
  '/inventory/reports/lifecycle': {
    get: list('รายงานวงจรชีวิตอุปกรณ์', ['Inventory']),
  },
  '/inventory/lifecycle-report': {
    get: list('รายงานวงจรชีวิตอุปกรณ์ (ชื่อ endpoint สำรอง)', ['Inventory']),
  },
  '/inventory/adjustments': {
    get: list('รายการคำขอปรับสต็อก', ['Inventory'], { queryParameters: [...paginationParameters, statusParameter] }),
  },
  '/inventory/{id}': {
    get: detail('ดูอุปกรณ์', ['Inventory']),
    patch: detail('แก้ไขอุปกรณ์บางฟิลด์', ['Inventory'], 'id', {
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
    delete: detail('ลบอุปกรณ์', ['Inventory']),
  },
  '/inventory/{id}/instances': {
    get: detail('ดู serial number ในสต็อก', ['Inventory']),
    post: detail('เพิ่ม serial number', ['Inventory'], 'id', {
      bodySchema: 'SerialNumbersRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/inventory/{id}/adjustments': {
    post: detail('ขอปรับสต็อก', ['Inventory'], 'id', {
      bodySchema: 'AdjustmentRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/inventory/instances/{instanceId}/timeline': {
    get: detail('ดูประวัติ serial number', ['Inventory'], 'instanceId'),
  },
  '/inventory/instances/{instanceId}': {
    patch: detail('แก้ไขสภาพ serial number', ['Inventory'], 'instanceId', {
      bodySchema: 'ConditionRequest',
      idempotent: true,
    }),
  },
  '/inventory/imports': {
    post: operation('นำเข้าอุปกรณ์จำนวนมาก', {
      tags: ['Inventory'],
      bodySchema: 'InventoryImportRequest',
      idempotent: true,
      success: 201,
    }),
  },

  '/inventory-adjustments/{adjustmentId}/actions/approve': {
    post: action('อนุมัติคำขอปรับสต็อก', ['Inventory Adjustments'], [pathParam('adjustmentId')], 'ReviewRequest'),
  },
  '/inventory-adjustments/{adjustmentId}/actions/reject': {
    post: action('ปฏิเสธคำขอปรับสต็อก', ['Inventory Adjustments'], [pathParam('adjustmentId')], 'ReviewWithRequiredNoteRequest'),
  },

  '/withdrawals': {
    get: list('รายการใบเบิก', ['Withdrawals']),
    post: operation('สร้างใบเบิก', {
      tags: ['Withdrawals'],
      bodySchema: 'WithdrawalRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/withdrawals/{id}': {
    get: detail('ดูใบเบิก', ['Withdrawals']),
    patch: detail('แก้ไขบริษัทของใบเบิก', ['Withdrawals'], 'id', { bodySchema: 'CompanyIdRequest' }),
    delete: detail('ลบใบเบิก', ['Withdrawals']),
  },
  '/withdrawals/{id}/items/{itemId}': {
    patch: operation('แก้ไข serial number ของรายการเบิก', {
      tags: ['Withdrawals'],
      parameters: [pathParam('id'), pathParam('itemId')],
      bodySchema: 'SerialNumbersRequest',
      idempotent: true,
    }),
  },

  '/returns': {
    post: operation('คืนอุปกรณ์', {
      tags: ['Returns'],
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      idempotent: true,
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
  },

  '/transactions': {
    get: list('รายการเคลื่อนไหวอุปกรณ์', ['Transactions']),
  },
  '/transactions/{id}': {
    delete: detail('ปฏิเสธการลบบัญชีคุมยอดย้อนหลัง', ['Transactions']),
  },
  '/transactions/latest': {
    get: operation('รายการเคลื่อนไหวล่าสุด', { tags: ['Transactions'] }),
  },
  '/purchase-orders': {
    get: list('รายการใบสั่งซื้อ', ['Purchase Orders']),
    post: operation('สร้างใบสั่งซื้อ', {
      tags: ['Purchase Orders'],
      bodySchema: 'PurchaseOrderRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/purchase-orders/vendors': {
    get: operation('รายชื่อผู้ขาย', { tags: ['Purchase Orders'] }),
  },
  '/purchase-orders/{id}': {
    get: detail('ดูใบสั่งซื้อ', ['Purchase Orders']),
    patch: detail('แก้ไขใบสั่งซื้อบางฟิลด์', ['Purchase Orders'], 'id', { bodySchema: 'PurchaseOrderPatchRequest' }),
    delete: detail('ลบใบสั่งซื้อ', ['Purchase Orders']),
  },
  '/purchase-orders/{id}/receipts': {
    post: detail('รับของตามใบสั่งซื้อ', ['Purchase Orders'], 'id', {
      bodySchema: 'ReceiveRequest',
      idempotent: true,
    }),
  },
  '/purchase-orders/actions/auto-generate': {
    post: action('สร้างใบสั่งซื้ออัตโนมัติ', ['Purchase Orders'], [], 'EmptyRequest'),
  },

  '/search': {
    get: operation('ค้นหาข้อมูลรวม', {
      tags: ['Search'],
      queryParameters: [requiredQueryParam('q', { type: 'string', minLength: 1, maxLength: 200 }, 'คำค้นหา')],
    }),
  },
  '/reports/summary/counts': {
    get: operation('สรุปจำนวนรายงาน', { tags: ['Reports'], queryParameters: dateParameters }),
  },
  '/reports/{type}': {
    get: operation('สร้างรายงานตามประเภท', {
      tags: ['Reports'],
      parameters: [pathParam('type', 'string')],
      queryParameters: dateParameters,
    }),
  },

  '/stations/details': {
    get: operation('รายละเอียดสถานี', {
      tags: ['Stations'],
      queryParameters: [...paginationParameters, stationIdParameter],
    }),
  },
  '/stations': {
    get: list('รายการสถานี', ['Stations']),
    post: operation('สร้างสถานี', {
      tags: ['Stations'],
      bodySchema: 'StationRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/stations/{id}': {
    get: detail('ดูสถานี', ['Stations']),
    patch: detail('แก้ไขสถานีบางฟิลด์', ['Stations'], 'id', { bodySchema: 'StationPatchRequest' }),
    delete: detail('ลบสถานี', ['Stations']),
  },
  '/stations/{stationId}/assets/{inventoryId}': {
    patch: operation('เปลี่ยนสถานะอุปกรณ์ประจำสถานี', {
      tags: ['Stations'],
      parameters: [pathParam('stationId'), pathParam('inventoryId')],
      bodySchema: 'AssetStatusRequest',
      idempotent: true,
    }),
  },
  '/stations/{id}/actions/verify': {
    post: action('ตรวจสอบสถานี', ['Stations'], [pathParam('id')]),
  },
  '/stations/{id}/asset-movements': {
    post: detail('ย้ายอุปกรณ์ระหว่างสถานี', ['Stations'], 'id', {
      bodySchema: 'AssetMoveRequest',
      idempotent: true,
    }),
  },

  '/contracts': {
    get: list('รายการสัญญา', ['Contracts']),
    post: operation('สร้างสัญญา', {
      tags: ['Contracts'],
      bodySchema: 'ContractRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/contracts/{id}': {
    get: detail('ดูสัญญา', ['Contracts']),
    patch: detail('แก้ไขสัญญาบางฟิลด์', ['Contracts'], 'id', { bodySchema: 'ContractPatchRequest' }),
    delete: detail('ลบสัญญา', ['Contracts']),
  },

  '/settings/companies': {
    get: list('รายการบริษัท', ['Settings']),
    post: operation('สร้างบริษัท', {
      tags: ['Settings'],
      bodySchema: 'CompanyRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/settings/companies/{id}': {
    get: detail('ดูบริษัท', ['Settings']),
    patch: detail('แก้ไขบริษัทบางฟิลด์', ['Settings'], 'id', { bodySchema: 'CompanyPatchRequest' }),
    delete: detail('ลบบริษัท', ['Settings']),
  },
  '/settings/companies/{id}/actions/set-default': {
    post: action('ตั้งบริษัทเริ่มต้น', ['Settings'], [pathParam('id')]),
  },
  '/settings/logos': {
    get: list('รายการโลโก้', ['Settings']),
    post: operation('อัปโหลดโลโก้', {
      tags: ['Settings'],
      bodySchema: 'MultipartPayload',
      bodyContent: 'multipart/form-data',
      idempotent: true,
      description: 'ส่ง payload เป็น JSON ใน part ชื่อ payload และไฟล์ใน field files',
    }),
  },
  '/settings/logos/{id}/actions/set-default': {
    post: action('ตั้งโลโก้เริ่มต้น', ['Settings'], [pathParam('id')]),
  },
  '/settings/logos/{id}': {
    delete: detail('ลบโลโก้', ['Settings']),
  },
  '/settings/system': {
    get: operation('ดูการตั้งค่าระบบ', { tags: ['Settings'] }),
    patch: operation('แก้ไขการตั้งค่าระบบ', {
      tags: ['Settings'],
      bodySchema: 'SystemSettingsRequest',
    }),
  },
  '/settings/backups': {
    get: operation('ดูรายการ backup', { tags: ['Settings'] }),
    post: action('สร้าง backup', ['Settings'], [], 'EmptyRequest'),
  },
  '/settings/backups/{filename}': {
    delete: detail('ลบ backup', ['Settings'], 'filename', { parameters: [pathParam('filename', 'string')] }),
  },
  '/settings/backups/download/{filename}': {
    get: detail('ดาวน์โหลด backup', ['Settings'], 'filename', {
      parameters: [pathParam('filename', 'string')],
      file: true,
    }),
  },
  '/settings/backups/actions/restore': {
    post: action('กู้คืนจาก backup', ['Settings'], [], 'RestoreRequest'),
  },
  '/users/audit-logs': {
    get: operation('ดู audit logs', {
      tags: ['Users'],
      queryParameters: [...paginationParameters],
    }),
  },
  '/users': {
    get: list('รายการผู้ใช้', ['Users']),
    post: operation('สร้างผู้ใช้', {
      tags: ['Users'],
      bodySchema: 'UserRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/users/{id}': {
    get: detail('ดูผู้ใช้', ['Users']),
    patch: detail('แก้ไขผู้ใช้บางฟิลด์', ['Users'], 'id', { bodySchema: 'UserPatchRequest' }),
    delete: detail('ลบผู้ใช้', ['Users']),
  },

  '/stock-counts': {
    get: list('รายการรอบตรวจนับ', ['Stock Counts']),
    post: operation('สร้างรอบตรวจนับ', {
      tags: ['Stock Counts'],
      bodySchema: 'StockCountRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/stock-counts/{id}': {
    get: detail('ดูรอบตรวจนับ', ['Stock Counts']),
  },
  '/stock-counts/{id}/items/{itemId}': {
    patch: operation('บันทึกผลตรวจนับรายการ', {
      tags: ['Stock Counts'],
      parameters: [pathParam('id'), pathParam('itemId')],
      bodySchema: 'StockCountItemRequest',
      idempotent: true,
    }),
  },
  '/stock-counts/{id}/actions/complete': {
    post: action('ปิดรอบตรวจนับ', ['Stock Counts'], [pathParam('id')]),
  },
  '/stock-counts/{id}/actions/cancel': {
    post: action('ยกเลิกรอบตรวจนับ', ['Stock Counts'], [pathParam('id')]),
  },

  '/technicians': {
    get: list('รายการช่าง', ['Technicians']),
    post: operation('สร้างช่าง', {
      tags: ['Technicians'],
      bodySchema: 'TechnicianRequest',
      idempotent: true,
      success: 201,
    }),
  },
  '/technicians/{id}': {
    get: detail('ดูช่าง', ['Technicians']),
    patch: detail('แก้ไขช่างบางฟิลด์', ['Technicians'], 'id', { bodySchema: 'TechnicianPatchRequest' }),
  },

  '/technician-stock/holdings': {
    get: list('สต็อกที่ถือครองโดยช่าง', ['Technician Stock'], {
      queryParameters: [...paginationParameters, technicianIdParameter, stationIdParameter, inventoryIdParameter],
    }),
  },
  '/technician-stock/movements': {
    get: list('ประวัติการเคลื่อนไหวสต็อกช่าง', ['Technician Stock'], {
      queryParameters: [...paginationParameters, technicianIdParameter, inventoryIdParameter, queryParam('type', { type: 'string' }, 'ประเภทการเคลื่อนไหว')],
    }),
  },
  '/technician-stock/actions/load': {
    post: action('จ่ายอุปกรณ์ให้ช่าง', ['Technician Stock'], [], 'TechnicianStockRequest'),
  },
  '/technician-stock/actions/install': {
    post: action('ติดตั้งอุปกรณ์จากสต็อกช่าง', ['Technician Stock'], [], 'TechnicianStockRequest'),
  },
  '/technician-stock/actions/return': {
    post: action('คืนอุปกรณ์จากสต็อกช่าง', ['Technician Stock'], [], 'TechnicianStockRequest'),
  },
  '/technician-stock/movements/{id}': {
    delete: detail('ลบประวัติการเคลื่อนไหวสต็อกช่าง', ['Technician Stock']),
  },
};

const localSchemas = {
  EmptyRequest: z.object({}).strict(),
  ReviewWithRequiredNoteRequest: z.object({
    reviewNote: z.string().trim().min(1).max(1000),
  }).strict(),
  CompanyIdRequest: z.object({
    companyId: z.coerce.number().int().positive(),
  }).strict(),
  StockCountRequest: z.object({
    note: z.string().trim().max(1000).nullable().optional(),
  }).strict(),
  RestoreRequest: z.object({
    filename: z.string().trim().min(1).max(255),
    password: z.string().max(200).optional(),
    confirmText: z.string().max(100).optional(),
  }).strict(),
  LogoRequest: z.object({
    label: z.string().trim().max(300).optional(),
    companyId: z.coerce.number().int().positive().optional(),
  }).strict(),
  InventoryImportRequest: z.object({
    items: z.array(v2Schemas.inventoryItem).min(1).max(500),
  }).strict(),
  SystemSettingsRequest: z.object({}).passthrough(),
};

const schemas = {
  ApiResponse: {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: {},
      meta: { $ref: '#/components/schemas/PageMeta' },
    },
  },
  PageMeta: {
    type: 'object',
    required: ['requestId'],
    properties: {
      requestId: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
      totalPages: { type: 'integer', minimum: 0 },
      hasNextPage: { type: 'boolean' },
    },
  },
  ApiErrorResponse: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message', 'details', 'requestId'],
        properties: {
          code: { type: 'string', description: 'Stable English error code' },
          message: { type: 'string', description: 'ข้อความแสดงผลสำหรับผู้ใช้' },
          details: { type: 'array', items: { type: 'object' } },
          requestId: { type: 'string' },
        },
      },
    },
  },
  MultipartPayload: {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description: 'JSON-encoded camelCase payload validated by the endpoint schema',
      },
      files: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
        description: 'ไฟล์แนบ ใช้ชื่อ field files',
      },
    },
  },
  ...Object.fromEntries(Object.entries({
    LoginRequest: v2Schemas.login,
    ChangePasswordRequest: v2Schemas.changePassword,
    PaginationQuery: v2Schemas.pagination,
    RepairRequest: v2Schemas.repair,
    StatusTransitionRequest: v2Schemas.statusTransition,
    ReplacementRequest: v2Schemas.replacement,
    WithdrawalRequest: v2Schemas.withdrawal,
    SerialNumbersRequest: v2Schemas.serialNumbers,
    ReturnItemRequest: v2Schemas.returnItem,
    AdjustmentRequest: v2Schemas.adjustment,
    ReviewRequest: v2Schemas.review,
    PurchaseOrderRequest: v2Schemas.purchaseOrder,
    PurchaseOrderPatchRequest: v2Schemas.purchaseOrder.partial(),
    ReceiveRequest: v2Schemas.receive,
    StationRequest: v2Schemas.station,
    StationPatchRequest: v2Schemas.station.partial(),
    AssetMoveRequest: v2Schemas.assetMove,
    AssetStatusRequest: v2Schemas.assetStatus,
    ContractRequest: v2Schemas.contract,
    ContractPatchRequest: v2Schemas.contract.partial(),
    StockCountItemRequest: v2Schemas.stockCountItem,
    TechnicianStockRequest: v2Schemas.technicianStock,
    CompanyRequest: v2Schemas.company,
    CompanyPatchRequest: v2Schemas.company.partial(),
    UserRequest: v2Schemas.user,
    UserPatchRequest: v2Schemas.user.partial(),
    TechnicianRequest: v2Schemas.technician,
    TechnicianPatchRequest: v2Schemas.technician.partial(),
    ConditionRequest: v2Schemas.condition,
    InventoryItemRequest: v2Schemas.inventoryItem,
    ...localSchemas,
  }).map(([name, schema]) => [name, schemaFromZod(schema)])),
};

const parameters = {
  IdempotencyKey: {
    name: 'Idempotency-Key',
    in: 'header',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 200 },
    description: 'คีย์ที่ไม่ซ้ำต่อ request เพื่อป้องกันการทำรายการซ้ำ',
  },
  Page: {
    name: 'page',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  PageSize: {
    name: 'pageSize',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
  Query: {
    name: 'q',
    in: 'query',
    required: false,
    schema: { type: 'string', maxLength: 200 },
  },
  SortBy: {
    name: 'sortBy',
    in: 'query',
    required: false,
    schema: { type: 'string' },
  },
  SortOrder: {
    name: 'sortOrder',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
  },
};

module.exports = {
  openapi: '3.1.0',
  info: {
    title: 'Maintenance System API',
    version: '2.0.0',
    description: 'Versioned camelCase API with shared Zod validation, response envelopes, actions, and idempotent stock workflows.',
  },
  servers: [{ url: '/api/v2' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Authentication', description: 'การยืนยันตัวตนและบัญชีผู้ใช้' },
    { name: 'Repairs', description: 'งานซ่อม' },
    { name: 'Claims', description: 'เคลม' },
    { name: 'Inventory', description: 'คลังและ serial number' },
    { name: 'Inventory Adjustments', description: 'คำขอปรับสต็อก' },
    { name: 'Withdrawals', description: 'ใบเบิก' },
    { name: 'Returns', description: 'การคืนอุปกรณ์' },
    { name: 'Transactions', description: 'บัญชีคุมยอดอุปกรณ์' },
    { name: 'Purchase Orders', description: 'ใบสั่งซื้อและการรับของ' },
    { name: 'Search', description: 'การค้นหา' },
    { name: 'Reports', description: 'รายงาน' },
    { name: 'Stations', description: 'สถานี' },
    { name: 'Contracts', description: 'สัญญา' },
    { name: 'Settings', description: 'การตั้งค่าระบบ' },
    { name: 'Users', description: 'ผู้ใช้และ audit logs' },
    { name: 'Stock Counts', description: 'รอบตรวจนับ' },
    { name: 'Technicians', description: 'ช่าง' },
    { name: 'Technician Stock', description: 'สต็อกที่ช่างถือครอง' },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas,
    parameters,
  },
};
