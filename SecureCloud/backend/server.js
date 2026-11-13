
'use strict';

// Load and validate environment configuration
let env;

try {
  env = require('./config/env');
} catch (err) {
  console.error(`[config] ${err.message}`);
  process.exit(1);
}

const app = require('./app');
const { connectDB, disconnectDB } = require('./db/db');

// Render provides PORT automatically.
// Use env.port for local development.
const PORT = process.env.PORT || env.port;
const HOST = '0.0.0.0';

(async () => {
  try {
    // Connect to MongoDB before starting the server
    await connectDB();

    const server = app.listen(PORT, HOST, () => {
      console.log(
        `[server] SecureCloud running on port ${PORT} (${env.nodeEnv})`
      );
    });

    // Handle server errors
    server.on('error', (err) => {
      console.error('[server] HTTP server error:', err);
      process.exit(1);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`[server] ${signal} received, shutting down`);

      server.close(async () => {
        try {
          await disconnectDB();
          console.log('[server] MongoDB disconnected');
          process.exit(0);
        } catch (err) {
          console.error('[server] Shutdown error:', err);
          process.exit(1);
        }
      });

      setTimeout(() => {
        console.error('[server] Forced shutdown due to timeout');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  }
})();

// Handle unexpected promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
