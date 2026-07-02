export default () => ({
  env: process.env.ELYSIA_ENV ?? 'development',
  http: {
    port: parseInt(process.env.BACKEND_HTTP_PORT ?? '9401', 10),
  },
  ws: {
    port: parseInt(process.env.BACKEND_WS_PORT ?? '9402', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '63790', 10),
    password: process.env.REDIS_PASSWORD,
  },
  oauth: {
    discord: {
      clientId: process.env.OAUTH_DISCORD_CLIENT_ID,
      clientSecret: process.env.OAUTH_DISCORD_CLIENT_SECRET,
      callbackUrl: process.env.OAUTH_DISCORD_CALLBACK_URL,
    },
    google: {
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID,
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.OAUTH_GOOGLE_CALLBACK_URL,
    },
    github: {
      clientId: process.env.OAUTH_GITHUB_CLIENT_ID,
      clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
      callbackUrl: process.env.OAUTH_GITHUB_CALLBACK_URL,
    },
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  modrinth: {
    apiUrl: process.env.MODRINTH_API_URL ?? 'https://api.modrinth.com/v2',
  },
  curseforge: {
    apiUrl: process.env.CURSEFORGE_API_URL ?? 'https://api.curseforge.com/v1',
    apiKey: process.env.CURSEFORGE_API_KEY,
  },
  // Destination de sauvegarde par défaut pour tout le panel (un seul jeu de
  // credentials S3-compatible pour l'instance ; voir .env.example). Si
  // BACKUP_S3_BUCKET n'est pas défini, toutes les sauvegardes restent en
  // LOCAL (sur le node, via Elysia Node).
  backup: {
    driver: process.env.BACKUP_S3_BUCKET ? (process.env.BACKUP_DRIVER ?? 'S3') : 'LOCAL',
    s3: {
      endpoint: process.env.BACKUP_S3_ENDPOINT,
      bucket: process.env.BACKUP_S3_BUCKET,
      accessKey: process.env.BACKUP_S3_ACCESS_KEY,
      secretKey: process.env.BACKUP_S3_SECRET_KEY,
      useSsl: process.env.BACKUP_S3_USE_SSL !== 'false',
    },
  },
});
