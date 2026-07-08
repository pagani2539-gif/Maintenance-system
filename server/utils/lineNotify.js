const { query } = require('../database/db');
const https = require('https');

/**
 * Send a notification to LINE Messaging API
 * @param {string} category - 'repair' or 'stock'
 * @param {string} message - Message text to send
 */
const sendLineNotify = async (category, message) => {
  const targetKey = category === 'repair' ? 'line_token_repair' : 'line_token_stock';

  let rows;
  try {
    // Fetch both the channel access token and the target ID
    const result = await query(
      "SELECT key, value FROM system_settings WHERE key IN ('line_channel_access_token', $1)",
      [targetKey]
    );
    rows = result.rows;
  } catch (err) {
    console.error('Failed to fetch LINE settings from DB:', err.message);
    return;
  }

  const settings = {};
  (rows || []).forEach(r => {
    settings[r.key] = r.value;
  });

  const channelAccessToken = settings['line_channel_access_token'];
  const targetId = settings[targetKey];

  if (!channelAccessToken || channelAccessToken.trim() === '' || !targetId || targetId.trim() === '') {
    // LINE Messaging API is not fully configured/enabled for this category
    return;
  }

  const postData = JSON.stringify({
    to: targetId.trim(),
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  });

  const options = {
    hostname: 'api.line.me',
    port: 443,
    path: '/v2/bot/message/push',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken.trim()}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`LINE Messaging API failed: Status ${res.statusCode}, Body: ${body}`);
      } else {
        console.log(`LINE Notification sent successfully via Messaging API to category: ${category}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error('LINE Messaging API request error:', e.message);
  });

  req.setTimeout(10000, () => {
    req.destroy(new Error('LINE Messaging API request timed out after 10s'));
  });

  req.write(postData);
  req.end();
};

module.exports = { sendLineNotify };
