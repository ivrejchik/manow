import { z } from 'zod';
import {
  createUserSchema,
  loginSchema,
  magicLinkRequestSchema,
  createMeetingTypeSchema,
  updateMeetingTypeSchema,
  createAvailabilityRuleSchema,
  createBlackoutDateSchema,
  getSlotsQuerySchema,
  createHoldSchema,
  confirmBookingSchema,
  slotHeldEventSchema,
  slotReleasedEventSchema,
  bookingConfirmedEventSchema,
  bookingCanceledEventSchema,
  ndaCreatedEventSchema,
  ndaSentEventSchema,
  ndaSignedEventSchema,
  ndaExpiredEventSchema,
  emailRequestedEventSchema,
  emailSentEventSchema,
  availableSlotSchema,
  holdResponseSchema,
  bookingResponseSchema,
  meetingTypePublicSchema,
} from './schemas';

// ============================================================================
// User Types
// ============================================================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

// ============================================================================
// Meeting Type Types
// ============================================================================

export type CreateMeetingTypeInput = z.infer<typeof createMeetingTypeSchema>;
export type UpdateMeetingTypeInput = z.infer<typeof updateMeetingTypeSchema>;

export interface MeetingType {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locationText: string | null;
  requiresNda: boolean;
  ndaTemplateId: string | null;
  isActive: boolean;
  createdAt: Date;
}

// ============================================================================
// Availability Types
// ============================================================================

export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleSchema>;
export type CreateBlackoutDateInput = z.infer<typeof createBlackoutDateSchema>;

export interface AvailabilityRule {
  id: string;
  userId: string;
  meetingTypeId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  isActive: boolean;
}

export interface BlackoutDate {
  id: string;
  userId: string;
  blackoutDate: Date;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  isRecurringYearly: boolean;
}

// ============================================================================
// Booking Types
// ============================================================================

export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>;
export type CreateHoldInput = z.infer<typeof createHoldSchema>;
export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export type HoldStatus = 'active' | 'converted' | 'expired' | 'released';

export interface SlotHold {
  id: string;
  meetingTypeId: string;
  slotStart: Date;
  slotEnd: Date;
  heldByEmail: string;
  heldByName: string | null;
  status: HoldStatus;
  expiresAt: Date;
  idempotencyKey: string;
  createdAt: Date;
}

export type BookingStatus = 'confirmed' | 'canceled' | 'completed' | 'no_show';

export interface Booking {
  id: string;
  meetingTypeId: string;
  hostUserId: string;
  slotStart: Date;
  slotEnd: Date;
  guestEmail: string;
  guestName: string;
  guestTimezone: string;
  guestNotes: string | null;
  status: BookingStatus;
  ndaDocumentId: string | null;
  ndaSignedAt: Date | null;
  idempotencyKey: string;
  fromHoldId: string | null;
  createdAt: Date;
}

// ============================================================================
// Document Types
// ============================================================================

export type DocumentStatus = 'pending' | 'sent' | 'signed' | 'expired' | 'revoked';

export interface Document {
  id: string;
  holdId: string | null;
  bookingId: string | null;
  status: DocumentStatus;
  storageUrl: string | null;
  signedStorageUrl: string | null;
  signerEmail: string;
  signerName: string | null;
  externalEnvelopeId: string | null;
  sentAt: Date | null;
  signedAt: Date | null;
  signerIpAddress: string | null;
  auditData: Record<string, unknown> | null;
  createdAt: Date;
}

// ============================================================================
// Event Types
// ============================================================================

export type SlotHeldEvent = z.infer<typeof slotHeldEventSchema>;
export type SlotReleasedEvent = z.infer<typeof slotReleasedEventSchema>;
export type BookingConfirmedEvent = z.infer<typeof bookingConfirmedEventSchema>;
export type BookingCanceledEvent = z.infer<typeof bookingCanceledEventSchema>;
export type NdaCreatedEvent = z.infer<typeof ndaCreatedEventSchema>;
export type NdaSentEvent = z.infer<typeof ndaSentEventSchema>;
export type NdaSignedEvent = z.infer<typeof ndaSignedEventSchema>;
export type NdaExpiredEvent = z.infer<typeof ndaExpiredEventSchema>;
export type EmailRequestedEvent = z.infer<typeof emailRequestedEventSchema>;
export type EmailSentEvent = z.infer<typeof emailSentEventSchema>;

export type BookingEvent =
  | SlotHeldEvent
  | SlotReleasedEvent
  | BookingConfirmedEvent
  | BookingCanceledEvent;

export type DocumentEvent =
  | NdaCreatedEvent
  | NdaSentEvent
  | NdaSignedEvent
  | NdaExpiredEvent;

export type NotificationEvent = EmailRequestedEvent | EmailSentEvent;

// ============================================================================
// API Response Types
// ============================================================================

export type AvailableSlot = z.infer<typeof availableSlotSchema>;
export type HoldResponse = z.infer<typeof holdResponseSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
export type MeetingTypePublic = z.infer<typeof meetingTypePublicSchema>;

// ============================================================================
// Utility Types
// ============================================================================

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
