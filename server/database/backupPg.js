const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 10;
const isWindows = process.platform === 'win32';

/**
 * Resolve the path to a PostgreSQL client tool (pg_dump/pg_restore).
 * Checks PG_BIN_DIR env var first, then falls back to relying on PATH.
 * The Windows installer does not add these to PATH by default, so
 * production deploys should set PG_BIN_DIR (see DEPLOY.md).
 */
const resolvePgBin = (toolName) => {
  const exeName = isWindows ? `${toolName}.exe` : toolName;
  if (process.env.PG_BIN_DIR) {
    return path.join(process.env.PG_BIN_DIR, exeName);
  }
  return exeName; // rely on PATH
};

const execFileAsync = (file, args, options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { ...options, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
    if (err) {
      err.stderr = stderr;
      return reject(err);
    }
    resolve({ stdout, stderr });
  });
});

const timestampNow = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${date}_${hours}${minutes}${seconds}`;
};

const backupFileName = () => `backup_${timestampNow()}_${crypto.randomUUID().slice(0, 8)}.dump`;

/**
 * Perform a database backup using pg_dump's custom format (-Fc): compressed,
 * and restorable with pg_restore (selective/parallel restore supported).
 * @returns {Promise<string>} Path to the created backup file
 */
const runBackup = async () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backupPath = path.join(BACKUP_DIR, backupFileName());
  console.log(`Starting database backup to: ${backupPath}`);

  try {
    await execFileAsync(resolvePgBin('pg_dump'), ['-Fc', '-f', backupPath, process.env.DATABASE_URL]);
    console.log(`Database backup completed successfully: ${backupPath}`);
  } catch (err) {
    console.error('Database backup failed:', err.stderr || err.message);
    throw err;
  }

  try {
    await cleanOldBackups(BACKUP_DIR);
  } catch (cleanErr) {
    console.error('Old backups cleanup failed:', cleanErr.message);
  }

  await copyBackupOffsite(backupPath);

  return backupPath;
};

/**
 * Copies a verified backup to a mounted network share or cloud-synced folder.
 * Set OFFSITE_BACKUP_DIR to enable it. A partial file is never promoted until
 * the copy is complete and its byte count matches the local source file.
 */
const copyBackupOffsite = async (backupPath) => {
  const configuredDir = process.env.OFFSITE_BACKUP_DIR;
  if (!configuredDir) return;

  const offsiteDir = path.resolve(configuredDir);
  await fs.promises.mkdir(offsiteDir, { recursive: true });
  const destination = path.join(offsiteDir, path.basename(backupPath));
  const partialDestination = `${destination}.partial`;

  try {
    await fs.promises.copyFile(backupPath, partialDestination);
    const [sourceStats, destinationStats] = await Promise.all([
      fs.promises.stat(backupPath),
      fs.promises.stat(partialDestination),
    ]);
    if (sourceStats.size !== destinationStats.size) {
      throw new Error(`Offsite copy size mismatch (${sourceStats.size} != ${destinationStats.size})`);
    }
    await fs.promises.rename(partialDestination, destination);
    await cleanOldBackups(offsiteDir);
    console.log(`Offsite database backup completed successfully: ${destination}`);
  } catch (err) {
    await fs.promises.unlink(partialDestination).catch(() => {});
    console.error('Offsite database backup failed:', err.message);
    throw err;
  }
};

/**
 * Restore the database from a pg_dump custom-format file, replacing all
 * existing objects (--clean --if-exists mirrors the old "wipe and replace"
 * semantics of copying over the SQLite .db file).
 * @param {string} backupPath
 */
const runRestore = async (backupPath) => {
  console.log(`Starting database restore from: ${backupPath}`);
  try {
    await execFileAsync(resolvePgBin('pg_restore'), ['--clean', '--if-exists', '-d', process.env.DATABASE_URL, backupPath]);
    console.log('Database restore completed successfully.');
  } catch (err) {
    // pg_restore exits non-zero on some tolerable warnings (e.g. "does not
    // exist, skipping" from --if-exists on a fresh DB) — only treat it as a
    // hard failure if stderr doesn't look like those expected notices.
    const stderr = err.stderr || '';
    const onlyWarnings = stderr.split('\n').every(line => {
      const l = line.trim();
      return l === '' || l.startsWith('pg_restore: warning:') || l.includes('does not exist, skipping');
    });
    if (!onlyWarnings) {
      console.error('Database restore failed:', stderr || err.message);
      throw err;
    }
    console.warn('Database restore completed with warnings:', stderr);
  }
};

/**
 * Delete older backup files to keep only the latest MAX_BACKUPS.
 */
const cleanOldBackups = (directory) => {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, (err, files) => {
      if (err) return reject(err);

      const backupFiles = files
        .filter(f => f.startsWith('backup_') && f.endsWith('.dump'))
        .map(f => ({
          name: f,
          path: path.join(directory, f),
          time: fs.statSync(path.join(directory, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

      if (backupFiles.length > MAX_BACKUPS) {
        const filesToDelete = backupFiles.slice(MAX_BACKUPS);
        console.log(`Cleaning up ${filesToDelete.length} old backup files...`);

        filesToDelete.forEach(file => {
          fs.unlink(file.path, (unlinkErr) => {
            if (unlinkErr) {
              console.error(`Failed to delete old backup ${file.name}:`, unlinkErr.message);
            } else {
              console.log(`Deleted old backup: ${file.name}`);
            }
          });
        });
      }
      resolve();
    });
  });
};

/**
 * Schedule automated periodic backups.
 * Runs once immediately, then schedules every 24 hours.
 */
const scheduleBackups = () => {
  runBackup().catch(err => console.error('Initial startup database backup failed:', err.message));

  const intervalMs = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    console.log('Running scheduled daily database backup...');
    runBackup().catch(err => console.error('Scheduled database backup failed:', err.message));
  }, intervalMs);
  timer.unref?.();

  console.log('Automated database backup scheduler started (Interval: 24h)');
};

module.exports = {
  runBackup,
  runRestore,
  scheduleBackups,
  BACKUP_DIR
};
