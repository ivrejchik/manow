import { holdService } from '../services/hold.service';

const CHECK_INTERVAL_MS = 30_000; // 30 seconds

export async function startHoldExpirationWorker(): Promise<void> {
  console.log('Starting hold expiration worker...');

  async function checkExpiredHolds() {
    try {
      const expired = await holdService.expireHolds();

      if (expired.length > 0) {
        console.log(`Expired ${expired.length} holds`);
      }
    } catch (error) {
      console.error('Error in hold expiration worker:', error);
    }
  }

  // Run immediately on startup
  await checkExpiredHolds();

  // Then run periodically
  setInterval(checkExpiredHolds, CHECK_INTERVAL_MS);

  console.log(`Hold expiration worker running (checking every ${CHECK_INTERVAL_MS / 1000}s)`);
}

// Alternative implementation using pg_cron (if available)
// This SQL can be run manually to set up pg_cron:
/*
SELECT cron.schedule(
  'expire-holds',
  '30 seconds',
  $$
    UPDATE slot_holds
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW()
  $$
);
*/
