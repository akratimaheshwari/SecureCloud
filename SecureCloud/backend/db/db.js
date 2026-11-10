'use strict';
const mongoose = require('mongoose');

// Connects to MongoDB Atlas using MONGO_URI from the environment (never hard-coded).
// Exits the process on failure so the app never runs without a database.
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[db] MONGO_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  // Log runtime problems after the first connection (never log the URI: it holds credentials)
  mongoose.connection.on('error', (err) => console.error('[db] MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable / IP not allow-listed
      maxPoolSize: 10,
    });
    console.log(`[db] Connected to MongoDB, database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('[db] Initial connection failed:', err.message);
    process.exit(1);
  }
};

// Close cleanly (used by the seed script and on graceful shutdown)
const disconnectDB = async () => {
  await mongoose.connection.close();
};

module.exports = { connectDB, disconnectDB };
