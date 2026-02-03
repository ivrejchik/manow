import { jetstream, type JetStreamManager, type JetStreamClient } from '@nats-io/jetstream';
import { AckPolicy, DeliverPolicy, RetentionPolicy, StorageType } from '@nats-io/jetstream';
import { getNatsConnection } from '../lib/nats';

export interface StreamConfig {
  name: string;
  subjects: string[];
  retention: RetentionPolicy;
  maxAge: number; // nanoseconds
  duplicateWindow: number; // nanoseconds
  description: string;
}

// Stream configurations
export const STREAMS: StreamConfig[] = [
  {
    name: 'BOOKINGS',
    subjects: ['slot.held', 'slot.released', 'booking.confirmed', 'booking.canceled'],
    retention: RetentionPolicy.Limits,
    maxAge: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
    duplicateWindow: 2 * 60 * 1_000_000_000, // 2 minutes
    description: 'Slot holds and booking lifecycle events',
  },
  {
    name: 'DOCUMENTS',
    subjects: ['nda.created', 'nda.sent', 'nda.signed', 'nda.expired'],
    retention: RetentionPolicy.Limits,
    maxAge: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days
    duplicateWindow: 2 * 60 * 1_000_000_000,
    description: 'NDA document lifecycle events',
  },
  {
    name: 'NOTIFICATIONS',
    subjects: ['notify.email.requested', 'notify.email.sent'],
    retention: RetentionPolicy.Workqueue, // Delete after acknowledgment
    maxAge: 24 * 60 * 60 * 1_000_000_000, // 24 hours
    duplicateWindow: 2 * 60 * 1_000_000_000,
    description: 'Notification dispatch events',
  },
  {
    name: 'DEAD_LETTER',
    subjects: ['dlq.*'],
    retention: RetentionPolicy.Limits,
    maxAge: 90 * 24 * 60 * 60 * 1_000_000_000, // 90 days
    duplicateWindow: 2 * 60 * 1_000_000_000,
    description: 'Failed message dead letter queue',
  },
];

let jsm: JetStreamManager | null = null;
let js: JetStreamClient | null = null;

export async function getJetStreamManager(): Promise<JetStreamManager> {
  if (jsm) return jsm;

  const nc = await getNatsConnection();
  jsm = await jetstream(nc).jetstreamManager();
  return jsm;
}

export async function getJetStream(): Promise<JetStreamClient> {
  if (js) return js;

  const nc = await getNatsConnection();
  js = jetstream(nc);
  return js;
}

export async function initializeStreams(): Promise<void> {
  const manager = await getJetStreamManager();

  for (const config of STREAMS) {
    try {
      // Try to get existing stream
      await manager.streams.info(config.name);
      console.log(`Stream ${config.name} already exists`);

      // Update stream config
      await manager.streams.update(config.name, {
        subjects: config.subjects,
        retention: config.retention,
        max_age: config.maxAge,
        duplicate_window: config.duplicateWindow,
        description: config.description,
        storage: StorageType.File,
      });
      console.log(`Stream ${config.name} updated`);
    } catch (error) {
      // Stream doesn't exist, create it
      await manager.streams.add({
        name: config.name,
        subjects: config.subjects,
        retention: config.retention,
        max_age: config.maxAge,
        duplicate_window: config.duplicateWindow,
        description: config.description,
        storage: StorageType.File,
      });
      console.log(`Stream ${config.name} created`);
    }
  }
}

export async function ensureConsumer(
  streamName: string,
  consumerName: string,
  filterSubjects: string[],
  options: {
    ackPolicy?: AckPolicy;
    deliverPolicy?: DeliverPolicy;
    maxDeliver?: number;
    ackWait?: number; // nanoseconds
  } = {}
): Promise<void> {
  const manager = await getJetStreamManager();

  const consumerConfig = {
    durable_name: consumerName,
    filter_subjects: filterSubjects,
    ack_policy: options.ackPolicy ?? AckPolicy.Explicit,
    deliver_policy: options.deliverPolicy ?? DeliverPolicy.All,
    max_deliver: options.maxDeliver ?? 5,
    ack_wait: options.ackWait ?? 30_000_000_000, // 30 seconds default
  };

  try {
    await manager.consumers.info(streamName, consumerName);
    console.log(`Consumer ${consumerName} already exists on ${streamName}`);
    // Update existing consumer
    await manager.consumers.update(streamName, consumerName, consumerConfig);
  } catch {
    // Consumer doesn't exist, create it
    await manager.consumers.add(streamName, consumerConfig);
    console.log(`Consumer ${consumerName} created on ${streamName}`);
  }
}
