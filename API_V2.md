# Maintenance System API v2

Base URL: `/api/v2`

The v2 API uses camelCase JSON fields, numeric IDs, ISO 8601 dates/timestamps,
and a stable response envelope. The database remains an internal detail and is
not exposed through the API DTOs.

## Authentication

Protected routes use:

```http
Authorization: Bearer <JWT>
Idempotency-Key: <unique-key-for-write-requests>
```

`GET /api/health`, `GET /api`, `GET /api-docs`, and `GET /api-docs/v2` remain
unversioned system endpoints.

## Response contract

Single resources and action results:

```json
{
  "data": { "id": 12 },
  "meta": { "requestId": "req_..." }
}
```

Collections additionally include `page`, `pageSize`, `total`, `totalPages`,
and `hasNextPage` in `meta`. Query parameters are `page`, `pageSize`, `q`,
`sortBy`, and `sortOrder`; `pageSize` defaults to 25 and is capped at 100.

Errors always use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลไม่ถูกต้อง",
    "details": [{ "field": "items.0.quantity", "reason": "..." }],
    "requestId": "req_..."
  }
}
```

## Resources and workflow actions

```text
GET|POST       /repairs
GET|PATCH|DELETE /repairs/:id
POST           /repairs/:id/actions/status-transition
POST           /repairs/:id/actions/mark-read
POST           /repairs/:id/actions/replace-device

GET|POST       /claims
GET|PATCH|DELETE /claims/:id

GET|POST       /inventory
GET|PATCH|DELETE /inventory/:id
GET|POST       /inventory/:id/instances
PATCH          /inventory/instances/:instanceId
POST           /inventory/:id/adjustments
POST           /inventory-adjustments/:id/actions/approve|reject
POST           /inventory/imports

GET|POST       /withdrawals
GET|PATCH|DELETE /withdrawals/:id
PATCH          /withdrawals/:id/items/:itemId
POST           /returns

GET|POST       /purchase-orders
GET|PATCH|DELETE /purchase-orders/:id
POST           /purchase-orders/:id/receipts
POST           /purchase-orders/actions/auto-generate

GET|POST       /stations
GET|PATCH|DELETE /stations/:id
POST           /stations/:id/asset-movements
POST           /stations/:id/actions/verify

GET|POST       /contracts
GET|PATCH|DELETE /contracts/:id
GET|POST       /stock-counts
PATCH          /stock-counts/:id/items/:itemId
POST           /stock-counts/:id/actions/complete|cancel

GET|POST       /technicians
PATCH          /technicians/:id
GET            /technician-stock/holdings|movements
POST           /technician-stock/actions/load|install|return
DELETE         /technician-stock/movements/:id
```

Additional read-only endpoints for reports, search, dashboard statistics,
settings, users, logos, backups, and audit logs are available in the generated
OpenAPI document at `GET /api-docs/v2`.

## Multipart requests

File endpoints use `multipart/form-data` with one JSON part named `payload`
and binary parts named `files`:

```text
payload: {"stationId":12,"problem":"..."}
files: <image>
```

Images are validated by content type/signature and remain limited to 5 MB.
