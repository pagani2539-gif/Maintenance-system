const { query } = require('../database/db');

exports.globalSearch = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === '') {
      return res.json({
        inventory: [],
        repairs: [],
        claims: []
      });
    }

    const searchPattern = `%${q}%`;

    const [inventory, repairs, claims] = await Promise.all([
      // 1. Search Inventory Items
      query(`
        SELECT id, name, model, quantity, min_stock, image_path
        FROM inventory
        WHERE name ILIKE $1 OR model ILIKE $1 OR description ILIKE $1
        LIMIT 8
      `, [searchPattern]),

      // 2. Search Repair Tickets
      query(`
        SELECT r.id, r.ticket_no, r.device_name, r.reporter, r.status, r.received_at, r.location, r.station_id, s.name as station_name
        FROM repairs r
        LEFT JOIN stations s ON r.station_id = s.id
        WHERE r.type = 'repair' AND (
          r.ticket_no ILIKE $1 OR
          r.device_name ILIKE $1 OR
          r.reporter ILIKE $1 OR
          r.problem ILIKE $1 OR
          r.location ILIKE $1 OR
          s.name ILIKE $1
        )
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 8
      `, [searchPattern]),

      // 3. Search Claim Tickets
      query(`
        SELECT r.id, r.ticket_no, r.device_name, r.reporter, r.status, r.received_at, r.location, r.station_id, s.name as station_name
        FROM repairs r
        LEFT JOIN stations s ON r.station_id = s.id
        WHERE r.type = 'claim' AND (
          r.ticket_no ILIKE $1 OR
          r.device_name ILIKE $1 OR
          r.reporter ILIKE $1 OR
          r.problem ILIKE $1 OR
          r.location ILIKE $1 OR
          s.name ILIKE $1
        )
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 8
      `, [searchPattern])
    ]);

    res.json({
      inventory: inventory.rows,
      repairs: repairs.rows,
      claims: claims.rows
    });
  } catch (err) {
    console.error('Global Search Error:', err);
    res.status(500).json({ error: err.message });
  }
};
