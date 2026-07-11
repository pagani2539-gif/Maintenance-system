const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const { requireAuth } = require('../middlewares/auth');
const { loginRateLimit } = require('../middlewares/loginRateLimit');

// Public
router.post('/login', loginRateLimit, authController.login);

// Authenticated
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);

module.exports = router;
