import { type JetStreamPublishOptions } from '@nats-io/jetstream';
import { getJetStream } from './streams';
import type {
  SlotHeldEvent,
  SlotReleasedEvent,
  BookingConfirmedEvent,
  BookingCanceledEvent,
  NdaCreatedEvent,
  NdaSentEvent,
  NdaSignedEvent,
  NdaExpiredEvent,
  EmailRequestedEvent,
} from '@meeting-scheduler/shared';

const encoder = new TextEncoder();

type PublishableEvent =
  | SlotHeldEvent
  | SlotReleasedEvent
  | BookingConfirmedEvent
  | BookingCanceledEvent
  | NdaCreatedEvent
  | NdaSentEvent
  | NdaSignedEvent
  | NdaExpiredEvent
  | EmailRequestedEvent;

export class EventPublisher {
  async publish<T extends PublishableEvent>(
    subject: string,
    event: T,
    options?: Partial<JetStreamPublishOptions>
  ): Promise<void> {
    const js = await getJetStream();

    const data = encoder.encode(JSON.stringify(event));

    const pubAck = await js.publish(subject, data, {
      msgID: event.eventId, // For deduplication
      ...options,
    });

    console.log(
      `Published ${subject} event ${event.eventId} to stream ${pubAck.stream}, seq ${pubAck.seq}`
    );
  }

  // Convenience methods for specific event types
  async publishSlotHeld(data: SlotHeldEvent['data']): Promise<void> {
    const event: SlotHeldEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'slot.held',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('slot.held', event);
  }

  async publishSlotReleased(data: SlotReleasedEvent['data']): Promise<void> {
    const event: SlotReleasedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'slot.released',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('slot.released', event);
  }

  async publishBookingConfirmed(data: BookingConfirmedEvent['data']): Promise<void> {
    const event: BookingConfirmedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'booking.confirmed',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('booking.confirmed', event);
  }

  async publishBookingCanceled(data: BookingCanceledEvent['data']): Promise<void> {
    const event: BookingCanceledEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'booking.canceled',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('booking.canceled', event);
  }

  async publishNdaCreated(data: NdaCreatedEvent['data']): Promise<void> {
    const event: NdaCreatedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'nda.created',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('nda.created', event);
  }

  async publishNdaSent(data: NdaSentEvent['data']): Promise<void> {
    const event: NdaSentEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'nda.sent',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('nda.sent', event);
  }

  async publishNdaSigned(data: NdaSignedEvent['data']): Promise<void> {
    const event: NdaSignedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'nda.signed',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('nda.signed', event);
  }

  async publishNdaExpired(data: NdaExpiredEvent['data']): Promise<void> {
    const event: NdaExpiredEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'nda.expired',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('nda.expired', event);
  }

  async publishEmailRequested(data: EmailRequestedEvent['data']): Promise<void> {
    const event: EmailRequestedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'notify.email.requested',
      occurredAt: new Date().toISOString(),
      data,
    };
    await this.publish('notify.email.requested', event);
  }

  async publishToDeadLetter(
    originalSubject: string,
    originalEvent: unknown,
    error: string,
    attempts: number
  ): Promise<void> {
    const js = await getJetStream();

    const dlqEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      originalSubject,
      originalEvent,
      error,
      attempts,
    };

    const data = encoder.encode(JSON.stringify(dlqEvent));
    await js.publish(`dlq.${originalSubject}`, data);

    console.error(`Published failed event to dead letter queue: ${originalSubject}`, error);
  }
}

export const eventPublisher = new EventPublisher();
