import { getJetStream } from '../events/streams';
import { eventPublisher } from '../events/publisher';
import { sendEmail } from '../lib/resend';
import type { EmailRequestedEvent } from '@meeting-scheduler/shared';

const decoder = new TextDecoder();

export async function startEmailSenderWorker(): Promise<void> {
  console.log('Starting email sender worker...');

  const js = await getJetStream();

  // Get consumer for email notifications
  const consumer = await js.consumers.get('NOTIFICATIONS', 'email-sender');
  const messages = await consumer.consume();

  console.log('Email sender worker listening for messages...');

  for await (const msg of messages) {
    try {
      const event = JSON.parse(decoder.decode(msg.data)) as EmailRequestedEvent;

      if (event.eventType !== 'notify.email.requested') {
        msg.ack();
        continue;
      }

      console.log(`Processing email request: ${event.eventId}`);

      // For now, we just log the email request
      // The actual email sending is done directly in the email service
      // This worker could be used for queued/async email sending

      console.log(`Email to ${event.data.to}: ${event.data.subject}`);

      // Acknowledge the message
      msg.ack();
    } catch (error) {
      console.error('Error processing email message:', error);

      const deliveryCount = msg.info?.redeliveryCount ?? 0;

      if (deliveryCount >= 4) {
        // Max retries reached, send to dead letter queue
        try {
          const event = JSON.parse(decoder.decode(msg.data));
          await eventPublisher.publishToDeadLetter(
            'notify.email.requested',
            event,
            String(error),
            deliveryCount + 1
          );
        } catch (dlqError) {
          console.error('Failed to publish to DLQ:', dlqError);
        }
        msg.ack();
      } else {
        // Retry with backoff
        msg.nak(getBackoffDelay(deliveryCount));
      }
    }
  }
}

function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 5s, 30s, 2min
  const delays = [1000, 5000, 30000, 120000];
  return delays[Math.min(attempt, delays.length - 1)];
}
