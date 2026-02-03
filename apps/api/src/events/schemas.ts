// Re-export event schemas from shared package for convenience
export {
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
  bookingEventSchema,
  documentEventSchema,
  notificationEventSchema,
} from '@meeting-scheduler/shared';
