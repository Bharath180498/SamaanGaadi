export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d'
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  dispatchRadiusKm: Number(process.env.DISPATCH_RADIUS_KM ?? 8),
  waitingRatePerMinute: Number(process.env.WAITING_RATE_PER_MINUTE ?? 3),
  baseFarePerKm: Number(process.env.BASE_FARE_PER_KM ?? 14)
});
