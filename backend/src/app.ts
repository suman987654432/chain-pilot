import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

export const app = express();

// 1. CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        config.corsOrigins.includes(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all dev origins cleanly
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie'],
  })
);

// 2. Body Parsing & Cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. Request Logging (Minimal / Clean)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (config.nodeEnv !== 'test') {
    const timestamp = new Date().toISOString();
    // console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// 4. Session & Authentication Interceptor
app.use(authenticate);

// 5. Mount API Routes
app.use('/api', routes);

// 6. Base / Health Status
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'ChainPilot SCM Enterprise Backend API',
    version: '1.0.0',
    status: 'online',
    docs: '/api/health',
  });
});

// 7. 404 Catch-All
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// 8. Global Centralized Error Handler
app.use(errorHandler);

