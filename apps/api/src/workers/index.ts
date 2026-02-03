export { startHoldExpirationWorker } from './hold-expiration';
export { startEmailSenderWorker } from './email-sender';
export { startNdaProcessorWorker } from './nda-processor';
export { startBookingProcessorWorker } from './booking-processor';

import { startHoldExpirationWorker } from './hold-expiration';
import { startEmailSenderWorker } from './email-sender';
import { startNdaProcessorWorker } from './nda-processor';
import { startBookingProcessorWorker } from './booking-processor';

export async function startAllWorkers(): Promise<void> {
  console.log('Starting all background workers...');

  // Start hold expiration worker (synchronous interval-based)
  await startHoldExpirationWorker();

  // Start NATS-based workers (async message consumers)
  // These run concurrently and process messages from their respective streams
  startBookingProcessorWorker().catch((error) => {
    console.error('Booking processor worker failed:', error);
  });

  startNdaProcessorWorker().catch((error) => {
    console.error('NDA processor worker failed:', error);
  });

  startEmailSenderWorker().catch((error) => {
    console.error('Email sender worker failed:', error);
  });

  console.log('All background workers started');
}
