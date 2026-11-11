import { app } from './app';
import { config } from './config';
import { pool } from './lib/db';

async function bootstrap() {
  try {
    // 1. Verify PostgreSQL Database Connection on Startup
    const dbCheck = await pool.query('SELECT NOW() as now, current_database() as db');
    const { now, db } = dbCheck.rows[0];

    // 2. Start HTTP Listener
    const server = app.listen(config.port, () => {
      console.log('===============================================================');
      console.log(`  CHAINPILOT SCM BACKEND (EXPRESS + TYPESCRIPT) ONLINE`);
      console.log('===============================================================');
      console.log(`  • Server URL     : http://localhost:${config.port}`);
      console.log(`  • Health Probe   : http://localhost:${config.port}/api/health`);
      console.log(`  • API Base       : http://localhost:${config.port}/api`);
      console.log(`  • Database       : ${db} (Connected @ ${new Date(now).toLocaleTimeString()})`);
      console.log(`  • Environment    : ${config.nodeEnv}`);
      console.log('===============================================================');
    });

    // 3. Graceful Shutdown Handlers
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('PostgreSQL connection pool drained.');
          process.exit(0);
        } catch (err) {
          console.error('Error draining pool:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: any) {
    console.error('FATAL: Could not initialize ChainPilot backend server:');
    console.error(err);
    process.exit(1);
  }
}

bootstrap();

