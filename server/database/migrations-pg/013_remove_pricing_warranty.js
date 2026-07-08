module.exports = {
  name: '013_remove_pricing_warranty',
  up: async (client) => {
    await client.query(`ALTER TABLE inventory DROP COLUMN IF EXISTS unit_price`);
    await client.query(`ALTER TABLE inventory DROP COLUMN IF EXISTS warranty_months`);
    await client.query(`ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS unit_price`);
  }
};
