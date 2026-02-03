import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db, processedWebhooks, documents, slotHolds } from '../db';
import { eventPublisher } from '../events/publisher';
import { createHmac, timingSafeEqual } from 'crypto';

const app = new Hono();

// Verify SignWell webhook signature
function verifySignwellSignature(
  signature: string | undefined,
  body: string,
  secret: string
): boolean {
  if (!signature) return false;

  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// SignWell webhook handler
app.post('/signwell', async (c) => {
  const signature = c.req.header('X-Signwell-Signature');
  const rawBody = await c.req.text();

  // Verify signature
  const secret = process.env.SIGNWELL_WEBHOOK_SECRET;
  if (secret && !verifySignwellSignature(signature, rawBody, secret)) {
    console.error('Invalid SignWell webhook signature');
    return c.json({ error: 'Unauthorized', message: 'Invalid signature' }, 401);
  }

  let body: {
    event: string;
    document_id: string;
    completed_at?: string;
    recipients?: Array<{ email: string }>;
    custom_fields?: { hold_id?: string };
    files?: { completed?: { url?: string } };
    audit_trail?: Record<string, unknown>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON' }, 400);
  }

  const webhookId = `${body.document_id}:${body.event}`;

  // Check idempotency
  const [existing] = await db
    .select()
    .from(processedWebhooks)
    .where(
      and(
        eq(processedWebhooks.provider, 'signwell'),
        eq(processedWebhooks.webhookId, webhookId)
      )
    );

  if (existing?.status === 'completed') {
    // Already processed, return cached response
    return c.json(existing.responseBody || { received: true });
  }

  // Insert or update processing status
  if (!existing) {
    await db.insert(processedWebhooks).values({
      webhookId,
      provider: 'signwell',
      eventType: body.event,
      status: 'processing',
    });
  }

  try {
    // Process based on event type
    switch (body.event) {
      case 'document_sent': {
        // NDA has been sent to signer
        const holdId = body.custom_fields?.hold_id;
        if (holdId) {
          await db
            .update(documents)
            .set({
              status: 'sent',
              sentAt: new Date(),
              externalEnvelopeId: body.document_id,
            })
            .where(eq(documents.holdId, holdId));

          const [doc] = await db
            .select()
            .from(documents)
            .where(eq(documents.holdId, holdId));

          if (doc) {
            await eventPublisher.publishNdaSent({
              documentId: doc.id,
              holdId,
              signerEmail: doc.signerEmail,
              externalEnvelopeId: body.document_id,
            });
          }
        }
        break;
      }

      case 'document_completed': {
        // NDA has been signed
        const holdId = body.custom_fields?.hold_id;
        if (holdId) {
          const signedAt = body.completed_at ? new Date(body.completed_at) : new Date();

          await db
            .update(documents)
            .set({
              status: 'signed',
              signedAt,
              signedStorageUrl: body.files?.completed?.url,
              auditData: body.audit_trail,
            })
            .where(eq(documents.holdId, holdId));

          const [doc] = await db
            .select()
            .from(documents)
            .where(eq(documents.holdId, holdId));

          if (doc) {
            await eventPublisher.publishNdaSigned({
              documentId: doc.id,
              holdId,
              signerEmail: doc.signerEmail,
              signedAt: signedAt.toISOString(),
            });
          }
        }
        break;
      }

      case 'document_expired': {
        // NDA link has expired
        const holdId = body.custom_fields?.hold_id;
        if (holdId) {
          await db
            .update(documents)
            .set({ status: 'expired' })
            .where(eq(documents.holdId, holdId));

          const [doc] = await db
            .select()
            .from(documents)
            .where(eq(documents.holdId, holdId));

          if (doc) {
            await eventPublisher.publishNdaExpired({
              documentId: doc.id,
              holdId,
            });
          }
        }
        break;
      }

      default:
        console.log(`Unhandled SignWell event: ${body.event}`);
    }

    // Mark webhook as processed
    await db
      .update(processedWebhooks)
      .set({
        status: 'completed',
        responseBody: { received: true },
        processedAt: new Date(),
      })
      .where(
        and(
          eq(processedWebhooks.provider, 'signwell'),
          eq(processedWebhooks.webhookId, webhookId)
        )
      );

    return c.json({ received: true });
  } catch (error) {
    console.error('Error processing SignWell webhook:', error);

    // Mark as failed
    await db
      .update(processedWebhooks)
      .set({
        status: 'failed',
        responseBody: { error: String(error) },
        processedAt: new Date(),
      })
      .where(
        and(
          eq(processedWebhooks.provider, 'signwell'),
          eq(processedWebhooks.webhookId, webhookId)
        )
      );

    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export { app as webhooksRoutes };
