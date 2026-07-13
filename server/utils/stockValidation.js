const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const requirePositiveInteger = (value, label = 'จำนวน') => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw badRequest(`${label}ต้องเป็นจำนวนเต็มมากกว่า 0`);
  }
  return parsed;
};

const cleanAndValidateSerials = (serialNumbers, { maxQuantity, label = 'S/N' } = {}) => {
  if (serialNumbers == null) return [];
  if (!Array.isArray(serialNumbers)) {
    throw badRequest(`${label} ต้องเป็นรายการ`);
  }

  const cleaned = serialNumbers
    .map((serial) => String(serial ?? '').trim())
    .filter(Boolean);

  const seen = new Set();
  for (const serial of cleaned) {
    const key = serial.toLocaleLowerCase('en-US');
    if (seen.has(key)) throw badRequest(`พบ ${label} ซ้ำในรายการ: ${serial}`);
    seen.add(key);
  }

  if (maxQuantity != null && cleaned.length > maxQuantity) {
    throw badRequest(`จำนวน ${label} (${cleaned.length}) มากกว่าจำนวนอุปกรณ์ (${maxQuantity})`);
  }

  return cleaned;
};

module.exports = {
  badRequest,
  requirePositiveInteger,
  cleanAndValidateSerials,
};
