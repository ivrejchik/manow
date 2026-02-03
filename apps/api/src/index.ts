import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import {
  authRoutes,
  meetingTypesRoutes,
  availabilityRoutes,
  bookingsRoutes,
  publicBookingRoutes,
  realtimeRoutes,
  webhooksRoutes,
  ndaRoutes,
} from './routes';
import { initializeStreams, initializeConsumers } from './events';
import { closeNatsConnection } from './lib/nats';
import { startAllWorkers } from './workers';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  })
);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/meeting-types', meetingTypesRoutes);
app.route('/api/availability', availabilityRoutes);
app.route('/api/bookings', bookingsRoutes);
app.route('/api/book', publicBookingRoutes);
app.route('/api/realtime', realtimeRoutes);
app.route('/api/webhooks', webhooksRoutes);
app.route('/api/nda', ndaRoutes);

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  if (err instanceof Error) {
    // Handle Zod validation errors
    if (err.message.includes('Validation error')) {
      return c.json(
        {
          error: 'Validation Error',
          message: err.message,
        },
        400
      );
    }

    // Handle database constraint violations
    if (err.message.includes('unique constraint') || err.message.includes('duplicate key')) {
      return c.json(
        {
          error: 'Conflict',
          message: 'Resource already exists',
        },
        409
      );
    }
  }

  return c.json(
    {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
    500
  );
});

// Not found handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: 'The requested resource was not found',
    },
    404
  );
});

// Initialize and start server
async function start() {
  const port = parseInt(process.env.PORT || '3000', 10);

  try {
    // Initialize NATS streams and consumers
    console.log('Initializing NATS JetStream...');
    await initializeStreams();
    await initializeConsumers();
    console.log('NATS JetStream initialized');

    // Start background workers
    await startAllWorkers();

    // Start server
    console.log(`Starting server on port ${port}...`);

    Bun.serve({
      port,
      fetch: app.fetch,
    });

    console.log(`Server running on http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await closeNatsConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await closeNatsConnection();
  process.exit(0);
});

start();
