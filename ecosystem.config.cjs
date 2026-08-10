module.exports = {
  apps: [
    {
      name: 'whatsapp-automation',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
