import { eq, and, desc, sql } from 'drizzle-orm';
import {
  db,
  bookings,
  slotHolds,
  meetingTypes,
  users,
  documents,
  type Booking,
  type MeetingType,
  type User,
} from '../db';
import { holdService } from './hold.service';
import { eventPublisher } from '../events/publisher';

export interface ConfirmBookingParams {
  holdId: string;
  guestName: string;
  guestTimezone: string;
  guestNotes?: string;
  idempotencyKey: string;
}

export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
}

export interface BookingWithDetails extends Booking {
  meetingType: MeetingType;
  host: User;
}

export class BookingService {
  async confirmBooking(params: ConfirmBookingParams): Promise<BookingResult> {
    const { holdId, guestName, guestTimezone, guestNotes, idempotencyKey } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Check idempotency - return existing if same key
        const [existingBooking] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.idempotencyKey, idempotencyKey));

        if (existingBooking) {
          return { success: true, booking: existingBooking };
        }

        // 2. Get and validate hold
        const [hold] = await tx
          .select()
          .from(slotHolds)
          .where(eq(slotHolds.id, holdId));

        if (!hold) {
          return { success: false, error: 'Hold not found' };
        }

        if (hold.status !== 'active') {
          return { success: false, error: `Hold is ${hold.status}` };
        }

        if (hold.expiresAt < new Date()) {
          // Mark hold as expired
          await tx
            .update(slotHolds)
            .set({ status: 'expired' })
            .where(eq(slotHolds.id, holdId));
          return { success: false, error: 'Hold has expired' };
        }

        // 3. Get meeting type for host info
        const [meetingType] = await tx
          .select()
          .from(meetingTypes)
          .where(eq(meetingTypes.id, hold.meetingTypeId));

        if (!meetingType) {
          return { success: false, error: 'Meeting type not found' };
        }

        // 4. Check if NDA is required and signed
        if (meetingType.requiresNda) {
          const [ndaDocument] = await tx
            .select()
            .from(documents)
            .where(and(eq(documents.holdId, holdId), eq(documents.status, 'signed')));

          if (!ndaDocument) {
            return { success: false, error: 'NDA must be signed before booking' };
          }
        }

        // 5. Create booking
        const bookingId = crypto.randomUUID();

        const [booking] = await tx
          .insert(bookings)
          .values({
            id: bookingId,
            meetingTypeId: hold.meetingTypeId,
            hostUserId: meetingType.ownerId,
            slotStart: hold.slotStart,
            slotEnd: hold.slotEnd,
            guestEmail: hold.heldByEmail,
            guestName,
            guestTimezone,
            guestNotes,
            idempotencyKey,
            fromHoldId: holdId,
          })
          .returning();

        // 6. Convert hold to prevent reuse
        await tx
          .update(slotHolds)
          .set({ status: 'converted' })
          .where(eq(slotHolds.id, holdId));

        // 7. Link NDA document to booking if exists
        await tx
          .update(documents)
          .set({ bookingId })
          .where(eq(documents.holdId, holdId));

        return { success: true, booking };
      });
    } catch (error) {
      // Handle exclusion constraint violation (race condition)
      if (error instanceof Error && error.message.includes('no_double_booking')) {
        return { success: false, error: 'Slot already booked' };
      }
      throw error;
    }
  }

  async getBooking(bookingId: string): Promise<BookingWithDetails | null> {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(meetingTypes, eq(bookings.meetingTypeId, meetingTypes.id))
      .innerJoin(users, eq(bookings.hostUserId, users.id))
      .where(eq(bookings.id, bookingId));

    if (result.length === 0) {
      return null;
    }

    return {
      ...result[0].bookings,
      meetingType: result[0].meeting_types,
      host: result[0].users,
    };
  }

  async getHostBookings(
    hostUserId: string,
    options: {
      status?: 'confirmed' | 'canceled' | 'completed' | 'no_show';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<BookingWithDetails[]> {
    const { status, limit = 50, offset = 0 } = options;

    let query = db
      .select()
      .from(bookings)
      .innerJoin(meetingTypes, eq(bookings.meetingTypeId, meetingTypes.id))
      .innerJoin(users, eq(bookings.hostUserId, users.id))
      .where(eq(bookings.hostUserId, hostUserId))
      .orderBy(desc(bookings.slotStart))
      .limit(limit)
      .offset(offset);

    if (status) {
      query = db
        .select()
        .from(bookings)
        .innerJoin(meetingTypes, eq(bookings.meetingTypeId, meetingTypes.id))
        .innerJoin(users, eq(bookings.hostUserId, users.id))
        .where(and(eq(bookings.hostUserId, hostUserId), eq(bookings.status, status)))
        .orderBy(desc(bookings.slotStart))
        .limit(limit)
        .offset(offset);
    }

    const result = await query;

    return result.map((row) => ({
      ...row.bookings,
      meetingType: row.meeting_types,
      host: row.users,
    }));
  }

  async getUpcomingBookings(hostUserId: string, limit = 10): Promise<BookingWithDetails[]> {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(meetingTypes, eq(bookings.meetingTypeId, meetingTypes.id))
      .innerJoin(users, eq(bookings.hostUserId, users.id))
      .where(
        and(
          eq(bookings.hostUserId, hostUserId),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.slotStart} > NOW()`
        )
      )
      .orderBy(bookings.slotStart)
      .limit(limit);

    return result.map((row) => ({
      ...row.bookings,
      meetingType: row.meeting_types,
      host: row.users,
    }));
  }

  async cancelBooking(
    bookingId: string,
    canceledBy: 'host' | 'guest' | 'system',
    reason?: string
  ): Promise<Booking | null> {
    const [booking] = await db
      .update(bookings)
      .set({ status: 'canceled' })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
      .returning();

    if (booking) {
      await eventPublisher.publishBookingCanceled({
        bookingId: booking.id,
        meetingTypeId: booking.meetingTypeId,
        slotStart: booking.slotStart.toISOString(),
        slotEnd: booking.slotEnd.toISOString(),
        canceledBy,
        reason,
      });
    }

    return booking ?? null;
  }

  async markAsCompleted(bookingId: string): Promise<Booking | null> {
    const [booking] = await db
      .update(bookings)
      .set({ status: 'completed' })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
      .returning();

    return booking ?? null;
  }

  async markAsNoShow(bookingId: string): Promise<Booking | null> {
    const [booking] = await db
      .update(bookings)
      .set({ status: 'no_show' })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
      .returning();

    return booking ?? null;
  }

  async getBookingStats(hostUserId: string): Promise<{
    total: number;
    upcoming: number;
    completed: number;
    canceled: number;
  }> {
    const stats = await db
      .select({
        status: bookings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(eq(bookings.hostUserId, hostUserId))
      .groupBy(bookings.status);

    const result = {
      total: 0,
      upcoming: 0,
      completed: 0,
      canceled: 0,
    };

    for (const stat of stats) {
      result.total += stat.count;
      if (stat.status === 'completed') {
        result.completed = stat.count;
      } else if (stat.status === 'canceled') {
        result.canceled = stat.count;
      }
    }

    // Get upcoming count
    const [upcoming] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.hostUserId, hostUserId),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.slotStart} > NOW()`
        )
      );

    result.upcoming = upcoming?.count ?? 0;

    return result;
  }
}

export const bookingService = new BookingService();
