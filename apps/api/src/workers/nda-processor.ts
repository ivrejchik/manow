import { getJetStream } from '../events/streams';
import { eventPublisher } from '../events/publisher';
import { ndaService } from '../services/nda.service';
import { bookingService } from '../services/booking.service';
import { emailService } from '../services/email.service';
import type {
  NdaCreatedEvent,
  NdaSentEvent,
  NdaSignedEvent,
  NdaExpiredEvent,
} from '@meeting-scheduler/shared';

const decoder = new TextDecoder();

type NdaEvent = NdaCreatedEvent | NdaSentEvent | NdaSignedEvent | NdaExpiredEvent;

export async function startNdaProcessorWorker(): Promise<void> {
  console.log('Starting NDA processor worker...');

  const js = await getJetStream();

  const consumer = await js.consumers.get('DOCUMENTS', 'nda-processor');
  const messages = await consumer.consume();

  console.log('NDA processor worker listening for messages...');

  for await (const msg of messages) {
    try {
      const event = JSON.parse(decoder.decode(msg.data)) as NdaEvent;

      console.log(`Processing NDA event: ${event.eventType} - ${event.eventId}`);

      switch (event.eventType) {
        case 'nda.created':
          await handleNdaCreated(event);
          break;

        case 'nda.sent':
          await handleNdaSent(event);
          break;

        case 'nda.signed':
          await handleNdaSigned(event);
          break;

        case 'nda.expired':
          await handleNdaExpired(event);
          break;

        default:
          console.log(`Unknown NDA event type: ${(event as NdaEvent).eventType}`);
      }

      msg.ack();
    } catch (error) {
      console.error('Error processing NDA message:', error);

      const deliveryCount = msg.info?.redeliveryCount ?? 0;

      if (deliveryCount >= 4) {
        try {
          const event = JSON.parse(decoder.decode(msg.data));
          await eventPublisher.publishToDeadLetter(
            event.eventType || 'nda.unknown',
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

async function handleNdaCreated(event: NdaCreatedEvent): Promise<void> {
  console.log(`NDA created for hold ${event.data.holdId}`);
  // Could send notification to guest that NDA is ready to sign
}

async function handleNdaSent(event: NdaSentEvent): Promise<void> {
  console.log(`NDA sent to ${event.data.signerEmail}`);
  // Could track analytics or send reminder if not signed
}

async function handleNdaSigned(event: NdaSignedEvent): Promise<void> {
  console.log(`NDA signed by ${event.data.signerEmail} at ${event.data.signedAt}`);

  // Update document status
  await ndaService.updateDocumentStatus(event.data.documentId, 'signed', {
    signedAt: new Date(event.data.signedAt),
  });

  // The booking can now be confirmed
  // This is typically handled by the client after receiving the signing callback
}

async function handleNdaExpired(event: NdaExpiredEvent): Promise<void> {
  console.log(`NDA expired for hold ${event.data.holdId}`);

  // Update document status
  await ndaService.updateDocumentStatus(event.data.documentId, 'expired');

  // The hold should also be expired/released
  // This is typically handled by the webhook processor
}

function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 5s, 30s, 2min, 5min
  const delays = [1000, 5000, 30000, 120000, 300000];
  return delays[Math.min(attempt, delays.length - 1)];
}
