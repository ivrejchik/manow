import { eq, and, or, gte, lte, sql } from 'drizzle-orm';
import { DateTime, Interval } from 'luxon';
import {
  db,
  availabilityRules,
  blackoutDates,
  slotHolds,
  bookings,
  meetingTypes,
  users,
  type AvailabilityRule,
  type BlackoutDate,
  type MeetingType,
} from '../db';
import type { AvailableSlot } from '@meeting-scheduler/shared';

export interface GetAvailableSlotsParams {
  meetingTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  guestTimezone: string;
}

export interface SlotWithBuffer {
  start: DateTime;
  end: DateTime;
  bufferStart: DateTime;
  bufferEnd: DateTime;
}

export class AvailabilityService {
  async getAvailableSlots(params: GetAvailableSlotsParams): Promise<AvailableSlot[]> {
    const { meetingTypeId, startDate, endDate, guestTimezone } = params;

    // Get meeting type with owner info
    const [meetingType] = await db
      .select()
      .from(meetingTypes)
      .where(and(eq(meetingTypes.id, meetingTypeId), eq(meetingTypes.isActive, true)));

    if (!meetingType) {
      throw new Error('Meeting type not found');
    }

    // Get host's timezone from user
    const hostTimezone = await this.getHostTimezone(meetingType.ownerId);

    // Get availability rules
    const rules = await this.getAvailabilityRules(meetingType.ownerId, meetingTypeId);

    // Get blackout dates
    const blackouts = await this.getBlackoutDates(meetingType.ownerId, startDate, endDate);

    // Get existing holds and bookings
    const existingSlots = await this.getExistingSlots(meetingTypeId, startDate, endDate);

    // Generate available slots
    const slots = this.generateSlots(
      meetingType,
      rules,
      blackouts,
      existingSlots,
      startDate,
      endDate,
      hostTimezone,
      guestTimezone
    );

    return slots;
  }

  private async getHostTimezone(userId: string): Promise<string> {
    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    return user?.timezone || 'UTC';
  }

  private async getAvailabilityRules(
    userId: string,
    meetingTypeId: string
  ): Promise<AvailabilityRule[]> {
    // Get rules that are either global (no meeting type) or specific to this meeting type
    const rules = await db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.userId, userId),
          eq(availabilityRules.isActive, true),
          or(
            sql`${availabilityRules.meetingTypeId} IS NULL`,
            eq(availabilityRules.meetingTypeId, meetingTypeId)
          )
        )
      );

    return rules;
  }

  private async getBlackoutDates(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<BlackoutDate[]> {
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);

    const blackouts = await db
      .select()
      .from(blackoutDates)
      .where(
        and(
          eq(blackoutDates.userId, userId),
          or(
            // Regular blackout dates in range
            and(
              gte(blackoutDates.blackoutDate, startDate),
              lte(blackoutDates.blackoutDate, endDate)
            ),
            // Recurring yearly blackouts - check month/day match
            eq(blackoutDates.isRecurringYearly, true)
          )
        )
      );

    // Filter recurring yearly blackouts to only include matching dates in range
    return blackouts.filter((blackout) => {
      if (!blackout.isRecurringYearly) {
        return true;
      }

      const blackoutDate = DateTime.fromSQL(blackout.blackoutDate as unknown as string);
      const month = blackoutDate.month;
      const day = blackoutDate.day;

      // Check if any day in range matches the recurring date
      let current = start;
      while (current <= end) {
        if (current.month === month && current.day === day) {
          return true;
        }
        current = current.plus({ days: 1 });
      }
      return false;
    });
  }

  private async getExistingSlots(
    meetingTypeId: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ start: Date; end: Date }>> {
    const startDateTime = DateTime.fromISO(startDate).startOf('day').toJSDate();
    const endDateTime = DateTime.fromISO(endDate).endOf('day').toJSDate();

    // Get active holds
    const activeHolds = await db
      .select({
        start: slotHolds.slotStart,
        end: slotHolds.slotEnd,
      })
      .from(slotHolds)
      .where(
        and(
          eq(slotHolds.meetingTypeId, meetingTypeId),
          eq(slotHolds.status, 'active'),
          gte(slotHolds.slotStart, startDateTime),
          lte(slotHolds.slotEnd, endDateTime)
        )
      );

    // Get confirmed bookings
    const confirmedBookings = await db
      .select({
        start: bookings.slotStart,
        end: bookings.slotEnd,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.meetingTypeId, meetingTypeId),
          eq(bookings.status, 'confirmed'),
          gte(bookings.slotStart, startDateTime),
          lte(bookings.slotEnd, endDateTime)
        )
      );

    return [...activeHolds, ...confirmedBookings];
  }

  private generateSlots(
    meetingType: MeetingType,
    rules: AvailabilityRule[],
    blackouts: BlackoutDate[],
    existingSlots: Array<{ start: Date; end: Date }>,
    startDate: string,
    endDate: string,
    hostTimezone: string,
    guestTimezone: string
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];
    const now = DateTime.now();

    // Minimum booking lead time (2 hours from now)
    const minBookingTime = now.plus({ hours: 2 });

    // Iterate through each day in the range
    let currentDate = DateTime.fromISO(startDate, { zone: hostTimezone });
    const lastDate = DateTime.fromISO(endDate, { zone: hostTimezone });

    while (currentDate <= lastDate) {
      const dayOfWeek = currentDate.weekday % 7; // Convert to 0-6 (Sunday = 0)

      // Get rules for this day
      const dayRules = rules.filter((rule) => {
        const ruleStart = DateTime.fromSQL(rule.effectiveFrom as unknown as string);
        const ruleEnd = rule.effectiveUntil
          ? DateTime.fromSQL(rule.effectiveUntil as unknown as string)
          : null;

        if (currentDate < ruleStart) return false;
        if (ruleEnd && currentDate > ruleEnd) return false;

        return rule.dayOfWeek === dayOfWeek;
      });

      // Check if day is blacked out
      const isFullDayBlackout = blackouts.some((blackout) => {
        const blackoutDate = DateTime.fromSQL(blackout.blackoutDate as unknown as string);
        const matchesDate =
          blackoutDate.month === currentDate.month &&
          blackoutDate.day === currentDate.day &&
          (blackout.isRecurringYearly || blackoutDate.year === currentDate.year);

        return matchesDate && !blackout.startTime;
      });

      if (!isFullDayBlackout) {
        // Generate slots for each rule
        for (const rule of dayRules) {
          const ruleSlots = this.generateSlotsForRule(
            currentDate,
            rule,
            meetingType,
            blackouts,
            existingSlots,
            hostTimezone,
            guestTimezone,
            minBookingTime
          );
          slots.push(...ruleSlots);
        }
      }

      currentDate = currentDate.plus({ days: 1 });
    }

    return slots;
  }

  private generateSlotsForRule(
    date: DateTime,
    rule: AvailabilityRule,
    meetingType: MeetingType,
    blackouts: BlackoutDate[],
    existingSlots: Array<{ start: Date; end: Date }>,
    hostTimezone: string,
    guestTimezone: string,
    minBookingTime: DateTime
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];

    // Parse rule times in host timezone
    const [startHour, startMinute] = (rule.startTime as string).split(':').map(Number);
    const [endHour, endMinute] = (rule.endTime as string).split(':').map(Number);

    let slotStart = date.set({
      hour: startHour,
      minute: startMinute,
      second: 0,
      millisecond: 0,
    });

    const ruleEnd = date.set({
      hour: endHour,
      minute: endMinute,
      second: 0,
      millisecond: 0,
    });

    const durationMinutes = meetingType.durationMinutes;
    const bufferBefore = meetingType.bufferBeforeMinutes;
    const bufferAfter = meetingType.bufferAfterMinutes;

    while (slotStart.plus({ minutes: durationMinutes }) <= ruleEnd) {
      const slotEnd = slotStart.plus({ minutes: durationMinutes });
      const bufferStart = slotStart.minus({ minutes: bufferBefore });
      const bufferEnd = slotEnd.plus({ minutes: bufferAfter });

      // Check if slot is in the future
      if (slotStart > minBookingTime) {
        // Check for partial blackouts
        const hasBlackout = this.hasPartialBlackout(
          slotStart,
          slotEnd,
          blackouts,
          date
        );

        // Check for conflicts with existing slots (including buffers)
        const hasConflict = this.hasConflict(bufferStart, bufferEnd, existingSlots);

        // Convert to guest timezone for response
        const guestStart = slotStart.setZone(guestTimezone);
        const guestEnd = slotEnd.setZone(guestTimezone);

        slots.push({
          start: guestStart.toISO()!,
          end: guestEnd.toISO()!,
          available: !hasBlackout && !hasConflict,
        });
      }

      // Move to next slot (using duration as step)
      slotStart = slotStart.plus({ minutes: durationMinutes });
    }

    return slots;
  }

  private hasPartialBlackout(
    slotStart: DateTime,
    slotEnd: DateTime,
    blackouts: BlackoutDate[],
    date: DateTime
  ): boolean {
    return blackouts.some((blackout) => {
      const blackoutDate = DateTime.fromSQL(blackout.blackoutDate as unknown as string);
      const matchesDate =
        blackoutDate.month === date.month &&
        blackoutDate.day === date.day &&
        (blackout.isRecurringYearly || blackoutDate.year === date.year);

      if (!matchesDate || !blackout.startTime) return false;

      const [blackoutStartHour, blackoutStartMinute] = (blackout.startTime as string)
        .split(':')
        .map(Number);
      const [blackoutEndHour, blackoutEndMinute] = (blackout.endTime as string)
        .split(':')
        .map(Number);

      const blackoutStart = date.set({
        hour: blackoutStartHour,
        minute: blackoutStartMinute,
      });
      const blackoutEnd = date.set({
        hour: blackoutEndHour,
        minute: blackoutEndMinute,
      });

      const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);
      const blackoutInterval = Interval.fromDateTimes(blackoutStart, blackoutEnd);

      return slotInterval.overlaps(blackoutInterval);
    });
  }

  private hasConflict(
    bufferStart: DateTime,
    bufferEnd: DateTime,
    existingSlots: Array<{ start: Date; end: Date }>
  ): boolean {
    const slotInterval = Interval.fromDateTimes(bufferStart, bufferEnd);

    return existingSlots.some((existing) => {
      const existingInterval = Interval.fromDateTimes(
        DateTime.fromJSDate(existing.start),
        DateTime.fromJSDate(existing.end)
      );
      return slotInterval.overlaps(existingInterval);
    });
  }

  // CRUD operations for availability rules

  async createAvailabilityRule(
    userId: string,
    rule: {
      meetingTypeId?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      effectiveFrom?: string;
      effectiveUntil?: string;
    }
  ): Promise<AvailabilityRule> {
    const [created] = await db
      .insert(availabilityRules)
      .values({
        userId,
        meetingTypeId: rule.meetingTypeId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        effectiveFrom: rule.effectiveFrom || new Date().toISOString().split('T')[0],
        effectiveUntil: rule.effectiveUntil,
      })
      .returning();

    return created;
  }

  async getUserAvailabilityRules(userId: string): Promise<AvailabilityRule[]> {
    return db
      .select()
      .from(availabilityRules)
      .where(and(eq(availabilityRules.userId, userId), eq(availabilityRules.isActive, true)));
  }

  async deleteAvailabilityRule(userId: string, ruleId: string): Promise<void> {
    await db
      .delete(availabilityRules)
      .where(and(eq(availabilityRules.id, ruleId), eq(availabilityRules.userId, userId)));
  }

  // Blackout dates

  async createBlackoutDate(
    userId: string,
    blackout: {
      blackoutDate: string;
      startTime?: string;
      endTime?: string;
      reason?: string;
      isRecurringYearly?: boolean;
    }
  ): Promise<BlackoutDate> {
    const [created] = await db
      .insert(blackoutDates)
      .values({
        userId,
        blackoutDate: blackout.blackoutDate,
        startTime: blackout.startTime,
        endTime: blackout.endTime,
        reason: blackout.reason,
        isRecurringYearly: blackout.isRecurringYearly ?? false,
      })
      .returning();

    return created;
  }

  async getUserBlackoutDates(userId: string): Promise<BlackoutDate[]> {
    return db.select().from(blackoutDates).where(eq(blackoutDates.userId, userId));
  }

  async deleteBlackoutDate(userId: string, blackoutId: string): Promise<void> {
    await db
      .delete(blackoutDates)
      .where(and(eq(blackoutDates.id, blackoutId), eq(blackoutDates.userId, userId)));
  }
}

export const availabilityService = new AvailabilityService();
