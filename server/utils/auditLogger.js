const { query } = require('../database/db');

const logAudit = async (entityType, entityId, action, oldData, newData, userName) => {
  try {
    const result = await query(`
      INSERT INTO audit_logs (entity_type, entity_id, action, old_data, new_data, user_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      entityType,
      entityId,
      action,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      userName || 'System/Admin'
    ]);
    return result.rows[0].id;
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
    throw err;
  }
};

module.exports = {
  logAudit
};
