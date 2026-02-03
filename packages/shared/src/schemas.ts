import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);
export const timezoneSchema = z.string().min(1).max(100);
export const dateTimeSchema = z.string().datetime();

// ============================================================================
// User Schemas
// ============================================================================

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128).optional(),
  timezone: timezoneSchema.default('UTC'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
});

// ============================================================================
// Meeting Type Schemas
// ============================================================================

export const createMeetingTypeSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  durationMinutes: z.number().int().positive().max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
  locationText: z.string().max(1000).optional(),
  requiresNda: z.boolean().default(false),
  ndaTemplateId: uuidSchema.optional(),
});

export const updateMeetingTypeSchema = createMeetingTypeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ============================================================================
// Availability Schemas
// ============================================================================

export const createAvailabilityRuleSchema = z.object({
  meetingTypeId: uuidSchema.optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  effectiveFrom: z.string().date().optional(),
  effectiveUntil: z.string().date().optional(),
});

export const createBlackoutDateSchema = z.object({
  blackoutDate: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(500).optional(),
  isRecurringYearly: z.boolean().default(false),
});

// ============================================================================
// Booking Schemas
// ============================================================================

export const getSlotsQuerySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  timezone: timezoneSchema,
});

export const createHoldSchema = z.object({
  slotStart: dateTimeSchema,
  slotEnd: dateTimeSchema,
  email: emailSchema,
  name: z.string().min(1).max(255).optional(),
  idempotencyKey: uuidSchema,
});

export const confirmBookingSchema = z.object({
  holdId: uuidSchema,
  guestName: z.string().min(1).max(255),
  guestTimezone: timezoneSchema,
  guestNotes: z.string().max(2000).optional(),
  idempotencyKey: uuidSchema,
});

// ============================================================================
// Event Schemas (NATS JetStream)
// ============================================================================

const baseEventSchema = z.object({
  eventId: uuidSchema,
  occurredAt: dateTimeSchema,
});

export const slotHeldEventSchema = baseEventSchema.extend({
  eventType: z.literal('slot.held'),
  data: z.object({
    holdId: uuidSchema,
    meetingTypeId: uuidSchema,
    slotStart: dateTimeSchema,
    slotEnd: dateTimeSchema,
    heldByEmail: emailSchema,
    expiresAt: dateTimeSchema,
  }),
});

export const slotReleasedEventSchema = baseEventSchema.extend({
  eventType: z.literal('slot.released'),
  data: z.object({
    holdId: uuidSchema,
    meetingTypeId: uuidSchema,
    slotStart: dateTimeSchema,
    slotEnd: dateTimeSchema,
    reason: z.enum(['expired', 'canceled', 'converted']),
  }),
});

export const bookingConfirmedEventSchema = baseEventSchema.extend({
  eventType: z.literal('booking.confirmed'),
  data: z.object({
    bookingId: uuidSchema,
    meetingTypeId: uuidSchema,
    hostUserId: uuidSchema,
    slotStart: dateTimeSchema,
    slotEnd: dateTimeSchema,
    guestEmail: emailSchema,
    guestName: z.string(),
    ndaRequired: z.boolean(),
  }),
});

export const bookingCanceledEventSchema = baseEventSchema.extend({
  eventType: z.literal('booking.canceled'),
  data: z.object({
    bookingId: uuidSchema,
    meetingTypeId: uuidSchema,
    slotStart: dateTimeSchema,
    slotEnd: dateTimeSchema,
    canceledBy: z.enum(['host', 'guest', 'system']),
    reason: z.string().optional(),
  }),
});

export const ndaCreatedEventSchema = baseEventSchema.extend({
  eventType: z.literal('nda.created'),
  data: z.object({
    documentId: uuidSchema,
    holdId: uuidSchema,
    signerEmail: emailSchema,
    signerName: z.string().optional(),
  }),
});

export const ndaSentEventSchema = baseEventSchema.extend({
  eventType: z.literal('nda.sent'),
  data: z.object({
    documentId: uuidSchema,
    holdId: uuidSchema,
    signerEmail: emailSchema,
    externalEnvelopeId: z.string(),
  }),
});

export const ndaSignedEventSchema = baseEventSchema.extend({
  eventType: z.literal('nda.signed'),
  data: z.object({
    documentId: uuidSchema,
    holdId: uuidSchema,
    signerEmail: emailSchema,
    signedAt: dateTimeSchema,
  }),
});

export const ndaExpiredEventSchema = baseEventSchema.extend({
  eventType: z.literal('nda.expired'),
  data: z.object({
    documentId: uuidSchema,
    holdId: uuidSchema,
  }),
});

export const emailRequestedEventSchema = baseEventSchema.extend({
  eventType: z.literal('notify.email.requested'),
  data: z.object({
    templateId: z.string(),
    to: emailSchema,
    subject: z.string(),
    context: z.record(z.unknown()),
  }),
});

export const emailSentEventSchema = baseEventSchema.extend({
  eventType: z.literal('notify.email.sent'),
  data: z.object({
    emailId: z.string(),
    to: emailSchema,
    templateId: z.string(),
  }),
});

// Union of all events
export const bookingEventSchema = z.discriminatedUnion('eventType', [
  slotHeldEventSchema,
  slotReleasedEventSchema,
  bookingConfirmedEventSchema,
  bookingCanceledEventSchema,
]);

export const documentEventSchema = z.discriminatedUnion('eventType', [
  ndaCreatedEventSchema,
  ndaSentEventSchema,
  ndaSignedEventSchema,
  ndaExpiredEventSchema,
]);

export const notificationEventSchema = z.discriminatedUnion('eventType', [
  emailRequestedEventSchema,
  emailSentEventSchema,
]);

// ============================================================================
// API Response Schemas
// ============================================================================

export const availableSlotSchema = z.object({
  start: dateTimeSchema,
  end: dateTimeSchema,
  available: z.boolean(),
});

export const holdResponseSchema = z.object({
  holdId: uuidSchema,
  expiresAt: dateTimeSchema,
  ndaRequired: z.boolean(),
  ndaSigningUrl: z.string().url().optional(),
});

export const bookingResponseSchema = z.object({
  bookingId: uuidSchema,
  slotStart: dateTimeSchema,
  slotEnd: dateTimeSchema,
  hostName: z.string(),
  hostEmail: emailSchema,
  guestName: z.string(),
  guestEmail: emailSchema,
  locationText: z.string().optional(),
  icsDownloadUrl: z.string().url(),
});

export const meetingTypePublicSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  durationMinutes: z.number(),
  locationText: z.string().optional(),
  hostName: z.string(),
  requiresNda: z.boolean(),
});
