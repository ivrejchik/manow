import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  smallint,
  time,
  date,
  inet,
  jsonb,
  bigserial,
  pgEnum,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Enums
// ============================================================================

export const holdStatusEnum = pgEnum('hold_status', [
  'active',
  'converted',
  'expired',
  'released',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'confirmed',
  'canceled',
  'completed',
  'no_show',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'sent',
  'signed',
  'expired',
  'revoked',
]);

// ============================================================================
// Users & Auth
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  passwordHash: varchar('password_hash', { length: 255 }),
  emailVerified: boolean('email_verified').notNull().default(false),
  avatarUrl: text('avatar_url'),
  googleId: varchar('google_id', { length: 255 }).unique(),
  githubId: varchar('github_id', { length: 255 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Meeting Types
// ============================================================================

export const meetingTypes = pgTable(
  'meeting_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
    locationText: text('location_text'),
    requiresNda: boolean('requires_nda').notNull().default(false),
    ndaTemplateId: uuid('nda_template_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('meeting_types_owner_slug_unique').on(table.ownerId, table.slug),
    check('meeting_types_duration_positive', sql`${table.durationMinutes} > 0`),
  ]
);

// ============================================================================
// Availability
// ============================================================================

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meetingTypeId: uuid('meeting_type_id').references(() => meetingTypes.id, {
      onDelete: 'cascade',
    }),
    dayOfWeek: smallint('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveUntil: date('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    check('availability_rules_day_of_week_valid', sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
    check('availability_rules_time_range_valid', sql`${table.startTime} < ${table.endTime}`),
  ]
);

export const blackoutDates = pgTable('blackout_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  blackoutDate: date('blackout_date').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  reason: varchar('reason', { length: 500 }),
  isRecurringYearly: boolean('is_recurring_yearly').notNull().default(false),
});

// ============================================================================
// Slot Holds
// ============================================================================

export const slotHolds = pgTable('slot_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingTypeId: uuid('meeting_type_id')
    .notNull()
    .references(() => meetingTypes.id),
  slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
  slotEnd: timestamp('slot_end', { withTimezone: true }).notNull(),
  heldByEmail: varchar('held_by_email', { length: 255 }).notNull(),
  heldByName: varchar('held_by_name', { length: 255 }),
  status: holdStatusEnum('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Bookings
// ============================================================================

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingTypeId: uuid('meeting_type_id')
    .notNull()
    .references(() => meetingTypes.id),
  hostUserId: uuid('host_user_id')
    .notNull()
    .references(() => users.id),
  slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
  slotEnd: timestamp('slot_end', { withTimezone: true }).notNull(),
  guestEmail: varchar('guest_email', { length: 255 }).notNull(),
  guestName: varchar('guest_name', { length: 255 }).notNull(),
  guestTimezone: varchar('guest_timezone', { length: 100 }).notNull(),
  guestNotes: text('guest_notes'),
  status: bookingStatusEnum('status').notNull().default('confirmed'),
  ndaDocumentId: uuid('nda_document_id'),
  ndaSignedAt: timestamp('nda_signed_at', { withTimezone: true }),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  fromHoldId: uuid('from_hold_id').references(() => slotHolds.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Documents (NDAs)
// ============================================================================

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  holdId: uuid('hold_id').references(() => slotHolds.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  status: documentStatusEnum('status').notNull().default('pending'),
  storageUrl: text('storage_url'),
  signedStorageUrl: text('signed_storage_url'),
  signerEmail: varchar('signer_email', { length: 255 }).notNull(),
  signerName: varchar('signer_name', { length: 255 }),
  externalEnvelopeId: varchar('external_envelope_id', { length: 255 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signerIpAddress: inet('signer_ip_address'),
  auditData: jsonb('audit_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Webhook Idempotency
// ============================================================================

export const processedWebhooks = pgTable(
  'processed_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookId: varchar('webhook_id', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('processing'),
    responseBody: jsonb('response_body'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [unique('processed_webhooks_provider_webhook_id').on(table.provider, table.webhookId)]
);

// ============================================================================
// Audit Log
// ============================================================================

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  eventData: jsonb('event_data').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  actorType: varchar('actor_type', { length: 50 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkToken = typeof magicLinkTokens.$inferInsert;

export type MeetingType = typeof meetingTypes.$inferSelect;
export type NewMeetingType = typeof meetingTypes.$inferInsert;

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;

export type BlackoutDate = typeof blackoutDates.$inferSelect;
export type NewBlackoutDate = typeof blackoutDates.$inferInsert;

export type SlotHold = typeof slotHolds.$inferSelect;
export type NewSlotHold = typeof slotHolds.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type ProcessedWebhook = typeof processedWebhooks.$inferSelect;
export type NewProcessedWebhook = typeof processedWebhooks.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
