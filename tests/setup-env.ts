process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://sagep:test@localhost:5432/sagep_test?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-not-for-production";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-not-for-production";
process.env.JWT_ACCESS_EXPIRES_IN ??= "15m";
process.env.JWT_REFRESH_EXPIRES_IN ??= "7d";
process.env.AUTH_REFRESH_COOKIE_PERSISTENT ??= "false";
process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:5173";
