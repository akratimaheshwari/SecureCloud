'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const requestId = require('./middleware/requestId');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// Set TRUST_PROXY=1 when running behind a load balancer so rate limits and audit logs see the real client IP
app.set('trust proxy', env.trustProxy);

app.use(requestId);
app.use(helmet());
app.use(cors({
  origin: env.frontendOrigins, // only the configured frontend(s); curl/Postman/Lambda are not browsers, so CORS does not affect them
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Share tokens travel in the URL path, so they are redacted from access logs
morgan.token('safe-url', (req) => req.originalUrl.replace(/(\/shares\/access\/)[^/?#]+/, '$1[redacted]'));
morgan.token('id', (req) => req.id);
if (env.nodeEnv !== 'test') {
  app.use(morgan(':id :remote-addr :method :safe-url :status :res[content-length] - :response-time ms'));
}

app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SecureCloud Backend is running'
  });
});
app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
