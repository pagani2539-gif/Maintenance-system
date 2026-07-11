const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');
const logosDir = path.join(uploadDir, 'logos');
fs.mkdirSync(logosDir, { recursive: true });

// SVG is deliberately excluded: it can contain active content when served inline.
const IMAGE_TYPES = {
  'image/jpeg': {
    extension: '.jpg',
    isValid: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    isValid: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/gif': {
    extension: '.gif',
    isValid: (buffer) => buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  },
  'image/webp': {
    extension: '.webp',
    isValid: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

const filenameFor = (prefix, file) => `${prefix}${Date.now()}-${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype].extension}`;

const storageFor = (destination, prefixFor) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, destination),
  filename: (req, file, cb) => cb(null, filenameFor(prefixFor(file), file)),
});

const fileFilter = (req, file, cb) => {
  if (IMAGE_TYPES[file.mimetype]) return cb(null, true);

  const err = new Error('Only JPEG, PNG, GIF, and WebP images are allowed');
  err.statusCode = 400;
  return cb(err, false);
};

const removeFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

const validateImageContent = async (req, res, next) => {
  const files = req.file ? [req.file] : (Array.isArray(req.files) ? req.files : []);

  try {
    for (const file of files) {
      const type = IMAGE_TYPES[file.mimetype];
      const buffer = await fs.promises.readFile(file.path);
      if (!type || !type.isValid(buffer)) {
        const err = new Error('Uploaded file content does not match its image type');
        err.statusCode = 400;
        throw err;
      }
    }
    next();
  } catch (err) {
    await Promise.all(files.map((file) => removeFile(file)));
    next(err);
  }
};

const withImageValidation = (uploader) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) return next(err);
    return validateImageContent(req, res, next);
  });
};

const upload = multer({
  storage: storageFor(uploadDir, (file) => (file.fieldname === 'image' ? 'inv-' : '')),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadLogo = multer({
  storage: storageFor(logosDir, () => 'logo-'),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = {
  uploadRepairImages: withImageValidation(upload.array('images', 4)),
  uploadInventoryImage: withImageValidation(upload.single('image')),
  uploadReturnImage: withImageValidation(upload.single('image')),
  uploadCompanyLogo: withImageValidation(uploadLogo.single('logo')),
};
