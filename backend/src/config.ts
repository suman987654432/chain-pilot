import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  cookieName: 'cp_session',
  jwtSecret: process.env.SESSION_SECRET || 'chainpilot-dev-secret-change-in-production-min-32-chars-long!',
  nodeEnv: process.env.NODE_ENV || 'development',
};

