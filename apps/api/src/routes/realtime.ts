import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getJetStream } from '../events/streams';

const app = new Hono();
const decoder = new TextDecoder();

// SSE endpoint for real-time slot updates
app.get('/slots/:meetingTypeId', async (c) => {
  const meetingTypeId = c.req.param('meetingTypeId');

  return streamSSE(c, async (stream) => {
    const js = await getJetStream();

    // Create an ephemeral consumer for this client
    const consumer = await js.consumers.get('BOOKINGS', {
      filterSubjects: ['slot.*', 'booking.*'],
    });

    const messages = await consumer.consume();

    // Set up cleanup on stream abort (client disconnect)
    let isAborted = false;
    stream.onAbort(() => {
      isAborted = true;
      messages.stop();
    });

    // Send initial connection message
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ meetingTypeId, timestamp: new Date().toISOString() }),
    });

    try {
      for await (const msg of messages) {
        if (isAborted) break;

        try {
          const event = JSON.parse(decoder.decode(msg.data));

          // Only send events for the requested meeting type
          if (event.data?.meetingTypeId === meetingTypeId) {
            await stream.writeSSE({
              event: event.eventType,
              data: JSON.stringify(event.data),
              id: event.eventId,
            });
          }

          msg.ack();
        } catch (parseError) {
          console.error('Error parsing NATS message:', parseError);
          msg.ack(); // Ack to prevent redelivery of malformed messages
        }
      }
    } catch (error) {
      if (!isAborted) {
        console.error('SSE stream error:', error);
      }
    }
  });
});

// Health check for realtime service
app.get('/health', async (c) => {
  try {
    const js = await getJetStream();
    // Quick check that JetStream is accessible
    await js.views.kv('health-check', { timeout: 1000 }).catch(() => {
      // KV might not exist, but connection working is enough
    });
    return c.json({ status: 'ok' });
  } catch (error) {
    return c.json({ status: 'error', message: 'NATS connection failed' }, 503);
  }
});

export { app as realtimeRoutes };
