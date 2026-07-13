module.exports = {
  apps: [
    {
      name: 'maintenance-system',
      cwd: './server',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '5221',
        OFFSITE_BACKUP_DIR: 'database/offsite-backups'
      }
    }
  ]
};
