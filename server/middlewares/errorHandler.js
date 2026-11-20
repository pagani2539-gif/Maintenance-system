const isProduction = process.env.NODE_ENV === 'production';
const crypto = require('crypto');

module.exports = (err, req, res, next) => {
  // Always log the full error server-side for diagnostics.
  console.error('API Error:', err);

  if (req.originalUrl?.startsWith('/api/v2')) {
    const requestId = req.requestId || `req_${crypto.randomUUID()}`;
    const statusCode = err.statusCode || err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    const isJsonError = err.type === 'entity.parse.failed';
    return res.status(statusCode).json({
      error: {
        code: err.code || (isJsonError ? 'INVALID_JSON' : statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'API_ERROR'),
        message: isJsonError ? 'รูปแบบ JSON ไม่ถูกต้อง' : (statusCode >= 500 && isProduction
          ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
          : (err.message || 'คำขอไม่สำเร็จ')),
        details: err.details || [],
        requestId,
      },
    });
  }

  // Multer file limit errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'ขนาดไฟล์ภาพเกินขีดจำกัดที่กำหนดไว้ (สูงสุด 5MB)'
    });
  }

  const statusCode = err.statusCode || 500;

  // For client errors (4xx) the message is meaningful to the caller and safe
  // to return. For server errors (5xx) the message may contain SQL, file
  // paths, or other internals — in production return a generic message and
  // keep the detail in the server log only.
  let message = err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error)';
  if (statusCode >= 500 && isProduction) {
    message = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error)';
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message
  });
};
