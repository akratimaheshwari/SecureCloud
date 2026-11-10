'use strict';
// Entry point: validate config, connect to MongoDB, start HTTP, shut down cleanly.
let env;
try {
  env = require('./config/env'); // also loads .env
} catch (err) {
  console.error(`[config] ${err.message}`);
  process.exit(1);
}

const app = require('./app');
const { connectDB, disconnectDB } = require('./db/db');

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "SecureCloud Backend is running"
  });
}); 

(async () => {
  await connectDB(); // exits the process if MongoDB is unreachable

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref(); // force exit if connections hang
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection:', reason));
})();
