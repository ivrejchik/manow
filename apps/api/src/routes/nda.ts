import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ndaService } from '../services/nda.service';
import { holdService } from '../services/hold.service';

const app = new Hono();

// Create NDA for a hold (called by guest during booking flow)
app.post(
  '/create',
  zValidator(
    'json',
    z.object({
      holdId: z.string().uuid(),
      signerEmail: z.string().email(),
      signerName: z.string().min(1).max(255),
    })
  ),
  async (c) => {
    const { holdId, signerEmail, signerName } = c.req.valid('json');

    // Verify hold exists
    const holdResult = await holdService.getHoldWithMeetingType(holdId);
    if (!holdResult) {
      return c.json({ error: 'Not Found', message: 'Hold not found' }, 404);
    }

    // Check if meeting type requires NDA
    if (!holdResult.meetingType.requiresNda) {
      return c.json(
        { error: 'Bad Request', message: 'This meeting type does not require NDA' },
        400
      );
    }

    // Create NDA
    const result = await ndaService.createNda({
      holdId,
      signerEmail,
      signerName,
    });

    if (!result.success) {
      return c.json({ error: 'Bad Request', message: result.error }, 400);
    }

    return c.json({
      documentId: result.document!.id,
      signUrl: result.signUrl,
    });
  }
);

// Check NDA status
app.get('/:holdId/status', async (c) => {
  const holdId = c.req.param('holdId');

  const document = await ndaService.getDocumentByHoldId(holdId);

  if (!document) {
    return c.json({ error: 'Not Found', message: 'NDA not found' }, 404);
  }

  return c.json({
    status: document.status,
    signedAt: document.signedAt?.toISOString(),
  });
});

// Get signed document URL
app.get('/:documentId/download', async (c) => {
  const documentId = c.req.param('documentId');

  const url = await ndaService.getSignedDocumentUrl(documentId);

  if (!url) {
    return c.json({ error: 'Not Found', message: 'Signed document not found' }, 404);
  }

  return c.json({ url });
});

export { app as ndaRoutes };
