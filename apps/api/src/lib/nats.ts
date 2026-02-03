import { connect, type NatsConnection } from '@nats-io/transport-node';

let natsConnection: NatsConnection | null = null;

export async function getNatsConnection(): Promise<NatsConnection> {
  if (natsConnection) {
    return natsConnection;
  }

  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  natsConnection = await connect({
    servers: natsUrl,
    name: 'meeting-scheduler-api',
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  });

  console.log(`Connected to NATS at ${natsUrl}`);

  natsConnection.closed().then(() => {
    console.log('NATS connection closed');
    natsConnection = null;
  });

  return natsConnection;
}

export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.drain();
    natsConnection = null;
  }
}
