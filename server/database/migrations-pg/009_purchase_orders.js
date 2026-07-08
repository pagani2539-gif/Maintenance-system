module.exports = {
  name: '009_purchase_orders',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id BIGSERIAL PRIMARY KEY,
        po_no TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'Draft',
        created_by TEXT DEFAULT 'System',
        note TEXT,
        ordered_by TEXT,
        project_name TEXT,
        company_name TEXT,
        vendor_address TEXT,
        vendor_phone TEXT,
        vendor_contact_person TEXT,
        vendor_tax_id TEXT,
        buyer_department TEXT,
        buyer_phone TEXT,
        buyer_email TEXT,
        company_id BIGINT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id BIGSERIAL PRIMARY KEY,
        po_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        unit_price REAL DEFAULT 0,
        received_quantity INTEGER DEFAULT 0
      )
    `);
  }
};
