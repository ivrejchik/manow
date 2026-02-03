import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { bookingService } from '../services/booking.service';
import { requireAuth } from '../middleware/auth';

const app = new Hono();

// All routes require authentication
app.use('/*', requireAuth);

// List bookings
app.get('/', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status') as 'confirmed' | 'canceled' | 'completed' | 'no_show' | undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const bookings = await bookingService.getHostBookings(user.id, { status, limit, offset });

  return c.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart.toISOString(),
      slotEnd: b.slotEnd.toISOString(),
      guestEmail: b.guestEmail,
      guestName: b.guestName,
      guestTimezone: b.guestTimezone,
      guestNotes: b.guestNotes,
      status: b.status,
      meetingType: {
        id: b.meetingType.id,
        name: b.meetingType.name,
        slug: b.meetingType.slug,
        durationMinutes: b.meetingType.durationMinutes,
        locationText: b.meetingType.locationText,
      },
      createdAt: b.createdAt.toISOString(),
    })),
  });
});

// Get upcoming bookings
app.get('/upcoming', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '10', 10);

  const bookings = await bookingService.getUpcomingBookings(user.id, limit);

  return c.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart.toISOString(),
      slotEnd: b.slotEnd.toISOString(),
      guestEmail: b.guestEmail,
      guestName: b.guestName,
      guestTimezone: b.guestTimezone,
      status: b.status,
      meetingType: {
        id: b.meetingType.id,
        name: b.meetingType.name,
        slug: b.meetingType.slug,
        durationMinutes: b.meetingType.durationMinutes,
        locationText: b.meetingType.locationText,
      },
    })),
  });
});

// Get booking stats
app.get('/stats', async (c) => {
  const user = c.get('user');
  const stats = await bookingService.getBookingStats(user.id);
  return c.json({ stats });
});

// Get single booking
app.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const booking = await bookingService.getBooking(id);

  if (!booking) {
    return c.json({ error: 'Not Found', message: 'Booking not found' }, 404);
  }

  if (booking.hostUserId !== user.id) {
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403);
  }

  return c.json({
    booking: {
      id: booking.id,
      slotStart: booking.slotStart.toISOString(),
      slotEnd: booking.slotEnd.toISOString(),
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      guestTimezone: booking.guestTimezone,
      guestNotes: booking.guestNotes,
      status: booking.status,
      ndaSignedAt: booking.ndaSignedAt?.toISOString(),
      meetingType: {
        id: booking.meetingType.id,
        name: booking.meetingType.name,
        slug: booking.meetingType.slug,
        durationMinutes: booking.meetingType.durationMinutes,
        locationText: booking.meetingType.locationText,
        requiresNda: booking.meetingType.requiresNda,
      },
      createdAt: booking.createdAt.toISOString(),
    },
  });
});

// Cancel booking
app.post(
  '/:id/cancel',
  zValidator('json', z.object({ reason: z.string().max(500).optional() })),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const { reason } = c.req.valid('json');

    // Verify ownership
    const booking = await bookingService.getBooking(id);
    if (!booking) {
      return c.json({ error: 'Not Found', message: 'Booking not found' }, 404);
    }

    if (booking.hostUserId !== user.id) {
      return c.json({ error: 'Forbidden', message: 'Access denied' }, 403);
    }

    const canceled = await bookingService.cancelBooking(id, 'host', reason);

    if (!canceled) {
      return c.json(
        { error: 'Bad Request', message: 'Cannot cancel this booking' },
        400
      );
    }

    return c.json({ message: 'Booking canceled', booking: canceled });
  }
);

// Mark as completed
app.post('/:id/complete', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership
  const booking = await bookingService.getBooking(id);
  if (!booking) {
    return c.json({ error: 'Not Found', message: 'Booking not found' }, 404);
  }

  if (booking.hostUserId !== user.id) {
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403);
  }

  const completed = await bookingService.markAsCompleted(id);

  if (!completed) {
    return c.json(
      { error: 'Bad Request', message: 'Cannot mark this booking as completed' },
      400
    );
  }

  return c.json({ message: 'Booking marked as completed', booking: completed });
});

// Mark as no-show
app.post('/:id/no-show', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership
  const booking = await bookingService.getBooking(id);
  if (!booking) {
    return c.json({ error: 'Not Found', message: 'Booking not found' }, 404);
  }

  if (booking.hostUserId !== user.id) {
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403);
  }

  const noShow = await bookingService.markAsNoShow(id);

  if (!noShow) {
    return c.json(
      { error: 'Bad Request', message: 'Cannot mark this booking as no-show' },
      400
    );
  }

  return c.json({ message: 'Booking marked as no-show', booking: noShow });
});

export { app as bookingsRoutes };
