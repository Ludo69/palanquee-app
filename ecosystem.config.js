module.exports = {
    apps: [
      {
        name: 'palanquee-app',
        script: './app.js',
        env: {
          NODE_ENV: 'development',
          SSL_KEY_PATH: '/home/ludo/palanquee-app/certs/server.key',
          SSL_CERT_PATH: '/home/ludo/palanquee-app/certs/server.crt',
          HOST: '192.168.1.78',
          PORT: 3000,
        },
        env_production: {
          NODE_ENV: 'production',
          SSL_KEY_PATH: '/home/ludo/app/palanquee-app/certs/server.key',
          SSL_CERT_PATH: '/home/ludo/app/palanquee-app/certs/server.crt',
          HOST: '192.168.1.53',
          PORT: 3000,
        }
      }
    ]
  };