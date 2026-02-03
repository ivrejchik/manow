import { getJetStream } from '../events/streams';
import { eventPublisher } from '../events/publisher';
import { bookingService } from '../services/booking.service';
import { emailService } from '../services/email.service';
import type { BookingConfirmedEvent, BookingCanceledEvent } from '@meeting-scheduler/shared';

const decoder = new TextDecoder();

type BookingEvent = BookingConfirmedEvent | BookingCanceledEvent;

export async function startBookingProcessorWorker(): Promise<void> {
  console.log('Starting booking processor worker...');

  const js = await getJetStream();

  const consumer = await js.consumers.get('BOOKINGS', 'booking-processor');
  const messages = await consumer.consume();

  console.log('Booking processor worker listening for messages...');

  for await (const msg of messages) {
    try {
      const event = JSON.parse(decoder.decode(msg.data)) as BookingEvent;

      console.log(`Processing booking event: ${event.eventType} - ${event.eventId}`);

      switch (event.eventType) {
        case 'booking.confirmed':
          await handleBookingConfirmed(event);
          break;

        case 'booking.canceled':
          await handleBookingCanceled(event);
          break;

        default:
          console.log(`Unknown booking event type: ${(event as BookingEvent).eventType}`);
      }

      msg.ack();
    } catch (error) {
      console.error('Error processing booking message:', error);

      const deliveryCount = msg.info?.redeliveryCount ?? 0;

      if (deliveryCount >= 4) {
        try {
          const event = JSON.parse(decoder.decode(msg.data));
          await eventPublisher.publishToDeadLetter(
            event.eventType || 'booking.unknown',
            event,
            String(error),
            deliveryCount + 1
          );
        } catch (dlqError) {
          console.error('Failed to publish to DLQ:', dlqError);
        }
        msg.ack();
      } else {
        msg.nak(getBackoffDelay(deliveryCount));
      }
    }
  }
}

async function handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
  console.log(`Booking confirmed: ${event.data.bookingId}`);

  try {
    // Get full booking details
    const booking = await bookingService.getBooking(event.data.bookingId);

    if (!booking) {
      console.error(`Booking not found: ${event.data.bookingId}`);
      return;
    }

    // Send confirmation emails
    await Promise.all([
      emailService.sendBookingConfirmationToGuest({
        booking,
        meetingType: booking.meetingType,
        host: booking.host,
      }),
      emailService.sendBookingNotificationToHost({
        booking,
        meetingType: booking.meetingType,
        host: booking.host,
      }),
    ]);

    console.log(`Confirmation emails sent for booking ${event.data.bookingId}`);
  } catch (error) {
    console.error(`Error sending confirmation emails for ${event.data.bookingId}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

async function handleBookingCanceled(event: BookingCanceledEvent): Promise<void> {
  console.log(`Booking canceled: ${event.data.bookingId}`);

  try {
    // Get full booking details
    const booking = await bookingService.getBooking(event.data.bookingId);

    if (!booking) {
      console.error(`Booking not found: ${event.data.bookingId}`);
      return;
    }

    // Send cancellation emails
    await Promise.all([
      emailService.sendCancellationToGuest(
        booking,
        booking.meetingType,
        booking.host,
        event.data.reason
      ),
      emailService.sendCancellationToHost(
        booking,
        booking.meetingType,
        booking.host,
        event.data.canceledBy,
        event.data.reason
      ),
    ]);

    console.log(`Cancellation emails sent for booking ${event.data.bookingId}`);
  } catch (error) {
    console.error(`Error sending cancellation emails for ${event.data.bookingId}:`, error);
    throw error;
  }
}

function getBackoffDelay(attempt: number): number {
  const delays = [1000, 5000, 30000, 120000, 300000];
  return delays[Math.min(attempt, delays.length - 1)];
}
