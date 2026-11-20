const { z } = require('zod');

const id = z.coerce.number().int().positive();
const optionalId = id.nullable().optional();
const optionalText = z.string().trim().max(500).nullable().optional();
const dateText = z.string().datetime({ offset: true }).nullable().optional();
const dateOrDateTime = z.union([
  z.string().date(),
  z.string().datetime({ offset: true }),
]).nullable().optional();
const quantity = z.coerce.number().finite().positive();
const item = z.object({
  inventoryId: id,
  quantity,
  serialNumbers: z.array(z.string().trim().min(1).max(200)).optional(),
}).strict();

const pagination = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
  q: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(80).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).passthrough();

const login = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
}).strict();

const changePassword = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
}).strict();

const repair = z.object({
  reporter: z.string().trim().max(200).optional(),
  projectName: optionalText,
  location: z.string().trim().max(500).optional(),
  stationId: optionalId,
  stationAreaId: optionalId,
  deviceName: z.string().trim().max(200).optional(),
  problem: z.string().trim().max(5000).optional(),
  priority: z.string().trim().max(50).optional(),
  receivedAt: dateText,
  instanceId: optionalId,
  inventoryId: optionalId,
  companyId: optionalId,
}).strict();

const statusTransition = z.object({
  status: z.string().trim().min(1).max(100),
  user: z.string().trim().max(200).optional(),
  note: optionalText,
  technician: optionalText,
  repairNote: optionalText,
}).strict();

const replacement = z.object({
  oldSerial: z.string().trim().min(1).max(200),
  oldModel: z.string().trim().max(200).optional(),
  newSerial: z.string().trim().min(1).max(200),
  newModel: z.string().trim().max(200).optional(),
  technician: z.string().trim().max(200).optional(),
}).strict();

const withdrawal = z.object({
  recipient: z.string().trim().min(1).max(200),
  projectName: optionalText,
  location: optionalText,
  stationId: optionalId,
  stationAreaId: optionalId,
  contractId: optionalId,
  withdrawalDate: dateOrDateTime,
  contractReferenceType: z.enum(['contract', 'none', 'legacy']).optional(),
  contractReferenceNote: optionalText,
  type: z.string().trim().min(1).max(80),
  note: optionalText,
  returnDueDate: z.string().date().nullable().optional(),
  items: z.array(item).min(1).max(500),
}).strict();

const serialNumbers = z.object({
  serialNumbers: z.array(z.string().trim().min(1).max(200)).max(500),
}).strict();

const returnItem = z.object({
  inventoryId: id,
  instanceId: optionalId,
  quantity,
  condition: z.string().trim().max(80).optional(),
  note: optionalText,
  transactionId: optionalId,
}).strict();

const adjustment = z.object({
  operation: z.enum(['ADD', 'REMOVE', 'add', 'remove']),
  quantity,
  reason: z.string().trim().min(1).max(500),
  note: optionalText,
}).strict();

const review = z.object({ reviewNote: optionalText }).strict();

const purchaseOrder = z.object({
  companyId: optionalId,
  companyName: optionalText,
  orderedBy: optionalText,
  projectName: optionalText,
  note: optionalText,
  status: z.string().trim().max(50).optional(),
  vendorAddress: optionalText,
  vendorPhone: optionalText,
  vendorContactPerson: optionalText,
  vendorTaxId: optionalText,
  buyerDepartment: optionalText,
  buyerPhone: optionalText,
  buyerEmail: z.string().email().nullable().optional(),
  items: z.array(z.object({ inventoryId: id, quantity }).strict()).min(1).max(500).optional(),
}).strict();

const receive = z.object({
  items: z.array(z.object({ inventoryId: id, receivedQuantity: quantity }).strict()).max(500).optional(),
}).strict();

const station = z.object({
  name: z.string().trim().max(300).optional(),
  stationType: z.string().trim().max(100).optional(),
  highwayNo: optionalText,
  direction: optionalText,
  region: optionalText,
  province: optionalText,
  responsiblePerson: optionalText,
  operationalStartDate: z.string().date().nullable().optional(),
  gpsCoordinates: optionalText,
}).strict();

const assetMove = z.object({
  inventoryId: id,
  instanceId: optionalId,
  quantity: z.coerce.number().int().positive().optional().default(1),
  toStationId: id,
  note: optionalText,
}).strict();

const assetStatus = z.object({ status: z.string().trim().min(1).max(100), note: optionalText }).strict();
const contract = z.object({
  contractNo: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  yearBe: z.coerce.number().int().min(2000).max(3000),
  companyId: optionalId,
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  note: optionalText,
}).strict();

const stockCountItem = z.object({ countedQty: z.coerce.number().int().nonnegative().nullable(), note: optionalText }).strict();
const technicianStock = z.object({
  technicianId: id,
  items: z.array(z.object({
    inventoryId: id,
    quantity,
    trackSn: z.boolean().optional(),
    serialNumbers: z.array(z.string().trim().min(1).max(200)).optional(),
  }).strict()).min(1).max(500),
  stationId: optionalId,
  stationAreaId: optionalId,
  removedSerial: optionalText,
  removedModel: optionalText,
  note: optionalText,
}).strict();

const company = z.object({
  nameTh: optionalText,
  nameEn: optionalText,
  nameShort: optionalText,
  address: optionalText,
  phone: optionalText,
  email: z.string().email().nullable().optional(),
  taxId: optionalText,
  website: optionalText,
}).strict();

const user = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
  fullName: z.string().trim().max(200).optional(),
  isFull: z.boolean().optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
  forcePasswordChange: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

const technician = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  code: optionalText,
  phone: optionalText,
  userId: optionalId,
  isActive: z.boolean().optional(),
}).strict();

const condition = z.object({ condition: z.string().trim().min(1).max(80) }).strict();
const inventoryItem = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  model: optionalText,
  description: z.string().trim().max(5000).nullable().optional(),
  storageLocation: optionalText,
  quantity: z.coerce.number().int().nonnegative().optional(),
  minStock: z.coerce.number().int().nonnegative().optional(),
  requiresSn: z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).optional(),
}).strict();

module.exports = {
  pagination,
  login,
  changePassword,
  repair,
  statusTransition,
  replacement,
  withdrawal,
  serialNumbers,
  returnItem,
  adjustment,
  review,
  purchaseOrder,
  receive,
  station,
  assetMove,
  assetStatus,
  contract,
  stockCountItem,
  technicianStock,
  company,
  user,
  technician,
  condition,
  inventoryItem,
};
