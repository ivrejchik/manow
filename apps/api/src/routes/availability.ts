import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { availabilityService } from '../services/availability.service';
import { requireAuth } from '../middleware/auth';

const app = new Hono();

// All routes require authentication
app.use('/*', requireAuth);

// Schemas
const createAvailabilityRuleSchema = z.object({
  meetingTypeId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  effectiveFrom: z.string().date().optional(),
  effectiveUntil: z.string().date().optional(),
});

const createBlackoutDateSchema = z.object({
  blackoutDate: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(500).optional(),
  isRecurringYearly: z.boolean().optional(),
});

// List availability rules
app.get('/rules', async (c) => {
  const user = c.get('user');
  const rules = await availabilityService.getUserAvailabilityRules(user.id);
  return c.json({ rules });
});

// Create availability rule
app.post('/rules', zValidator('json', createAvailabilityRuleSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const rule = await availabilityService.createAvailabilityRule(user.id, data);
  return c.json({ rule }, 201);
});

// Delete availability rule
app.delete('/rules/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await availabilityService.deleteAvailabilityRule(user.id, id);
  return c.json({ message: 'Rule deleted' });
});

// List blackout dates
app.get('/blackouts', async (c) => {
  const user = c.get('user');
  const blackouts = await availabilityService.getUserBlackoutDates(user.id);
  return c.json({ blackouts });
});

// Create blackout date
app.post('/blackouts', zValidator('json', createBlackoutDateSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const blackout = await availabilityService.createBlackoutDate(user.id, data);
  return c.json({ blackout }, 201);
});

// Delete blackout date
app.delete('/blackouts/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await availabilityService.deleteBlackoutDate(user.id, id);
  return c.json({ message: 'Blackout date deleted' });
});

export { app as availabilityRoutes };
