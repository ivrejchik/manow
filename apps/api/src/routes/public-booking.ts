import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { meetingTypeService } from '../services/meeting-type.service';
import { availabilityService } from '../services/availability.service';
import { holdService } from '../services/hold.service';
import { bookingService } from '../services/booking.service';
import { holdRateLimit } from '../middleware/rate-limit';
import { eventPublisher } from '../events/publisher';

const app = new Hono();

// Schemas
const getSlotsQuerySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  timezone: z.string().min(1).max(100),
});

const createHoldSchema = z.object({
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  idempotencyKey: z.string().uuid(),
});

const confirmBookingSchema = z.object({
  holdId: z.string().uuid(),
  guestName: z.string().min(1).max(255),
  guestTimezone: z.string().min(1).max(100),
  guestNotes: z.string().max(2000).optional(),
  idempotencyKey: z.string().uuid(),
});

// Get meeting type info (public)
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  return c.json({
    meetingType: {
      id: meetingType.id,
      name: meetingType.name,
      slug: meetingType.slug,
      durationMinutes: meetingType.durationMinutes,
      locationText: meetingType.locationText,
      requiresNda: meetingType.requiresNda,
      hostName: meetingType.owner.name,
      hostTimezone: meetingType.owner.timezone,
    },
  });
});

// Get available slots
app.get('/:slug/slots', zValidator('query', getSlotsQuerySchema), async (c) => {
  const slug = c.req.param('slug');
  const query = c.req.valid('query');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  const slots = await availabilityService.getAvailableSlots({
    meetingTypeId: meetingType.id,
    startDate: query.startDate,
    endDate: query.endDate,
    guestTimezone: query.timezone,
  });

  return c.json({ slots });
});

// Create slot hold
app.post('/:slug/hold', holdRateLimit, zValidator('json', createHoldSchema), async (c) => {
  const slug = c.req.param('slug');
  const data = c.req.valid('json');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  const result = await holdService.createHold({
    meetingTypeId: meetingType.id,
    slotStart: data.slotStart,
    slotEnd: data.slotEnd,
    email: data.email,
    name: data.name,
    idempotencyKey: data.idempotencyKey,
  });

  if (!result.success) {
    return c.json({ error: 'Conflict', message: result.error }, 409);
  }

  // Publish slot held event
  await eventPublisher.publishSlotHeld({
    holdId: result.holdId!,
    meetingTypeId: meetingType.id,
    slotStart: data.slotStart,
    slotEnd: data.slotEnd,
    heldByEmail: data.email,
    expiresAt: result.expiresAt!.toISOString(),
  });

  return c.json(
    {
      holdId: result.holdId,
      expiresAt: result.expiresAt!.toISOString(),
      ndaRequired: meetingType.requiresNda,
      // If NDA required, the client will need to trigger NDA creation
    },
    201
  );
});

// Get hold status
app.get('/:slug/hold/:holdId', async (c) => {
  const slug = c.req.param('slug');
  const holdId = c.req.param('holdId');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  const result = await holdService.getHoldWithMeetingType(holdId);

  if (!result || result.meetingType.slug !== slug) {
    return c.json({ error: 'Not Found', message: 'Hold not found' }, 404);
  }

  return c.json({
    hold: {
      id: result.hold.id,
      status: result.hold.status,
      slotStart: result.hold.slotStart.toISOString(),
      slotEnd: result.hold.slotEnd.toISOString(),
      expiresAt: result.hold.expiresAt.toISOString(),
    },
  });
});

// Release hold (cancel)
app.delete('/:slug/hold/:holdId', async (c) => {
  const slug = c.req.param('slug');
  const holdId = c.req.param('holdId');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  const result = await holdService.getHoldWithMeetingType(holdId);

  if (!result || result.meetingType.slug !== slug) {
    return c.json({ error: 'Not Found', message: 'Hold not found' }, 404);
  }

  const released = await holdService.releaseHold(holdId, 'canceled');

  if (!released) {
    return c.json(
      { error: 'Bad Request', message: 'Cannot release this hold' },
      400
    );
  }

  return c.json({ message: 'Hold released' });
});

// Confirm booking
app.post('/:slug/confirm', zValidator('json', confirmBookingSchema), async (c) => {
  const slug = c.req.param('slug');
  const data = c.req.valid('json');

  const meetingType = await meetingTypeService.getBySlugWithOwner(slug);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  // Verify hold belongs to this meeting type
  const holdResult = await holdService.getHoldWithMeetingType(data.holdId);

  if (!holdResult || holdResult.meetingType.slug !== slug) {
    return c.json({ error: 'Not Found', message: 'Hold not found' }, 404);
  }

  const result = await bookingService.confirmBooking({
    holdId: data.holdId,
    guestName: data.guestName,
    guestTimezone: data.guestTimezone,
    guestNotes: data.guestNotes,
    idempotencyKey: data.idempotencyKey,
  });

  if (!result.success) {
    return c.json({ error: 'Bad Request', message: result.error }, 400);
  }

  // Publish booking confirmed event
  await eventPublisher.publishBookingConfirmed({
    bookingId: result.booking!.id,
    meetingTypeId: meetingType.id,
    hostUserId: meetingType.ownerId,
    slotStart: result.booking!.slotStart.toISOString(),
    slotEnd: result.booking!.slotEnd.toISOString(),
    guestEmail: result.booking!.guestEmail,
    guestName: result.booking!.guestName,
    ndaRequired: meetingType.requiresNda,
  });

  // Mark hold as converted
  await holdService.releaseHold(data.holdId, 'converted');

  return c.json({
    booking: {
      id: result.booking!.id,
      slotStart: result.booking!.slotStart.toISOString(),
      slotEnd: result.booking!.slotEnd.toISOString(),
      hostName: meetingType.owner.name,
      hostEmail: meetingType.owner.email,
      guestName: result.booking!.guestName,
      guestEmail: result.booking!.guestEmail,
      locationText: meetingType.locationText,
    },
  });
});

export { app as publicBookingRoutes };
