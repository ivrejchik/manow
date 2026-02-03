import { eq, and, sql, lt } from 'drizzle-orm';
import { db, slotHolds, bookings, meetingTypes, type SlotHold } from '../db';
import { eventPublisher } from '../events/publisher';

const HOLD_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface CreateHoldParams {
  meetingTypeId: string;
  slotStart: string;
  slotEnd: string;
  email: string;
  name?: string;
  idempotencyKey: string;
}

export interface HoldResult {
  success: boolean;
  holdId?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Hash a string to a 64-bit integer for PostgreSQL advisory locks.
 * Uses a simple FNV-1a inspired hash.
 */
function hashToInt64(input: string): bigint {
  let hash = BigInt(0xcbf29ce484222325n);
  const fnvPrime = BigInt(0x100000001b3n);

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asIntN(64, hash * fnvPrime);
  }

  return hash;
}

export class HoldService {
  async createHold(params: CreateHoldParams): Promise<HoldResult> {
    const { meetingTypeId, slotStart, slotEnd, email, name, idempotencyKey } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Check idempotency - return existing if same key
        const [existing] = await tx
          .select()
          .from(slotHolds)
          .where(eq(slotHolds.idempotencyKey, idempotencyKey));

        if (existing) {
          if (existing.status === 'active') {
            return {
              success: true,
              holdId: existing.id,
              expiresAt: existing.expiresAt,
            };
          }
          // If the previous hold with this key expired/released, treat as conflict
          return { success: false, error: 'Previous hold expired' };
        }

        // 2. Verify meeting type exists and is active
        const [meetingType] = await tx
          .select()
          .from(meetingTypes)
          .where(and(eq(meetingTypes.id, meetingTypeId), eq(meetingTypes.isActive, true)));

        if (!meetingType) {
          return { success: false, error: 'Meeting type not found' };
        }

        // 3. Acquire advisory lock (serializes concurrent attempts for same slot)
        const lockKey = hashToInt64(`${meetingTypeId}:${slotStart}`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

        // 4. Check for conflicts with active holds
        const [holdConflict] = await tx
          .select()
          .from(slotHolds)
          .where(
            and(
              eq(slotHolds.meetingTypeId, meetingTypeId),
              eq(slotHolds.status, 'active'),
              sql`tstzrange(${slotHolds.slotStart}, ${slotHolds.slotEnd}, '[)') &&
                  tstzrange(${slotStart}::timestamptz, ${slotEnd}::timestamptz, '[)')`
            )
          );

        if (holdConflict) {
          return { success: false, error: 'Slot already held' };
        }

        // 5. Check for conflicts with confirmed bookings
        const [bookingConflict] = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.meetingTypeId, meetingTypeId),
              eq(bookings.status, 'confirmed'),
              sql`tstzrange(${bookings.slotStart}, ${bookings.slotEnd}, '[)') &&
                  tstzrange(${slotStart}::timestamptz, ${slotEnd}::timestamptz, '[)')`
            )
          );

        if (bookingConflict) {
          return { success: false, error: 'Slot already booked' };
        }

        // 6. Insert hold (exclusion constraint is final safety net)
        const holdId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);

        await tx.insert(slotHolds).values({
          id: holdId,
          meetingTypeId,
          slotStart: new Date(slotStart),
          slotEnd: new Date(slotEnd),
          heldByEmail: email.toLowerCase(),
          heldByName: name,
          expiresAt,
          idempotencyKey,
        });

        return { success: true, holdId, expiresAt };
      });
    } catch (error) {
      // Handle exclusion constraint violation
      if (
        error instanceof Error &&
        error.message.includes('no_overlapping_active_holds')
      ) {
        return { success: false, error: 'Slot already held' };
      }
      throw error;
    }
  }

  async getHold(holdId: string): Promise<SlotHold | null> {
    const [hold] = await db.select().from(slotHolds).where(eq(slotHolds.id, holdId));
    return hold ?? null;
  }

  async getHoldWithMeetingType(holdId: string): Promise<{
    hold: SlotHold;
    meetingType: typeof meetingTypes.$inferSelect;
  } | null> {
    const result = await db
      .select()
      .from(slotHolds)
      .innerJoin(meetingTypes, eq(slotHolds.meetingTypeId, meetingTypes.id))
      .where(eq(slotHolds.id, holdId));

    if (result.length === 0) {
      return null;
    }

    return {
      hold: result[0].slot_holds,
      meetingType: result[0].meeting_types,
    };
  }

  async releaseHold(holdId: string, reason: 'canceled' | 'converted'): Promise<boolean> {
    const [hold] = await db
      .update(slotHolds)
      .set({
        status: reason === 'converted' ? 'converted' : 'released',
      })
      .where(and(eq(slotHolds.id, holdId), eq(slotHolds.status, 'active')))
      .returning();

    if (hold) {
      await eventPublisher.publishSlotReleased({
        holdId: hold.id,
        meetingTypeId: hold.meetingTypeId,
        slotStart: hold.slotStart.toISOString(),
        slotEnd: hold.slotEnd.toISOString(),
        reason,
      });
      return true;
    }

    return false;
  }

  async expireHolds(): Promise<SlotHold[]> {
    const expired = await db
      .update(slotHolds)
      .set({ status: 'expired' })
      .where(and(eq(slotHolds.status, 'active'), lt(slotHolds.expiresAt, new Date())))
      .returning();

    // Publish events for each expired hold
    for (const hold of expired) {
      await eventPublisher.publishSlotReleased({
        holdId: hold.id,
        meetingTypeId: hold.meetingTypeId,
        slotStart: hold.slotStart.toISOString(),
        slotEnd: hold.slotEnd.toISOString(),
        reason: 'expired',
      });
    }

    return expired;
  }

  async extendHold(holdId: string): Promise<SlotHold | null> {
    const newExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

    const [hold] = await db
      .update(slotHolds)
      .set({ expiresAt: newExpiresAt })
      .where(and(eq(slotHolds.id, holdId), eq(slotHolds.status, 'active')))
      .returning();

    return hold ?? null;
  }
}

export const holdService = new HoldService();
