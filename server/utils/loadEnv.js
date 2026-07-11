const fs = require('fs');
const path = require('path');

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const equalsAt = trimmed.indexOf('=');
  if (equalsAt === -1) return null;

  const key = trimmed.slice(0, equalsAt).trim();
  let value = trimmed.slice(equalsAt + 1).trim();

  if (!key) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

const loadEnv = () => {
  const envName = process.env.NODE_ENV || 'development';
  const serverRoot = path.join(__dirname, '..');

  // Environment-specific file loads first so its values win; loadEnvFile's
  // "only set if undefined" guard makes the base .env act as a fallback.
  loadEnvFile(path.join(serverRoot, `.env.${envName}`));
  loadEnvFile(path.join(serverRoot, '.env'));
};

module.exports = loadEnv;
