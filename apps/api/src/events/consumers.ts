import { AckPolicy, DeliverPolicy } from '@nats-io/jetstream';
import { ensureConsumer } from './streams';

export interface ConsumerConfig {
  stream: string;
  name: string;
  filterSubjects: string[];
  ackPolicy: AckPolicy;
  deliverPolicy?: DeliverPolicy;
  maxDeliver: number;
  ackWait: number; // nanoseconds
  description: string;
}

export const CONSUMERS: ConsumerConfig[] = [
  {
    stream: 'BOOKINGS',
    name: 'booking-processor',
    filterSubjects: ['booking.confirmed', 'booking.canceled'],
    ackPolicy: AckPolicy.Explicit,
    maxDeliver: 5,
    ackWait: 30_000_000_000, // 30 seconds
    description: 'Handles booking confirmations and cancellations',
  },
  {
    stream: 'DOCUMENTS',
    name: 'nda-processor',
    filterSubjects: ['nda.*'],
    ackPolicy: AckPolicy.Explicit,
    maxDeliver: 5,
    ackWait: 60_000_000_000, // 60 seconds - external API calls
    description: 'Integrates with SignWell for NDA processing',
  },
  {
    stream: 'NOTIFICATIONS',
    name: 'email-sender',
    filterSubjects: ['notify.email.requested'],
    ackPolicy: AckPolicy.Explicit,
    maxDeliver: 5,
    ackWait: 30_000_000_000,
    description: 'Sends emails via Resend',
  },
  {
    stream: 'BOOKINGS',
    name: 'realtime-gateway',
    filterSubjects: ['slot.*', 'booking.*'],
    ackPolicy: AckPolicy.Explicit,
    deliverPolicy: DeliverPolicy.New, // Only new messages
    maxDeliver: 3,
    ackWait: 5_000_000_000, // 5 seconds - real-time requires fast processing
    description: 'Pushes events to SSE clients',
  },
];

export async function initializeConsumers(): Promise<void> {
  for (const config of CONSUMERS) {
    await ensureConsumer(config.stream, config.name, config.filterSubjects, {
      ackPolicy: config.ackPolicy,
      deliverPolicy: config.deliverPolicy,
      maxDeliver: config.maxDeliver,
      ackWait: config.ackWait,
    });
  }
}
