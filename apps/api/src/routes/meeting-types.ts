import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { meetingTypeService } from '../services/meeting-type.service';
import { requireAuth } from '../middleware/auth';

const app = new Hono();

// All routes require authentication
app.use('/*', requireAuth);

// Schemas
const createMeetingTypeSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  durationMinutes: z.number().int().positive().max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  locationText: z.string().max(1000).optional(),
  requiresNda: z.boolean().optional(),
  ndaTemplateId: z.string().uuid().optional(),
});

const updateMeetingTypeSchema = createMeetingTypeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// List meeting types
app.get('/', async (c) => {
  const user = c.get('user');
  const meetingTypes = await meetingTypeService.getByOwner(user.id);

  return c.json({ meetingTypes });
});

// Get active meeting types only
app.get('/active', async (c) => {
  const user = c.get('user');
  const meetingTypes = await meetingTypeService.getActiveByOwner(user.id);

  return c.json({ meetingTypes });
});

// Create meeting type
app.post('/', zValidator('json', createMeetingTypeSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  // Check if slug is available
  const isAvailable = await meetingTypeService.isSlugAvailable(user.id, data.slug);
  if (!isAvailable) {
    return c.json(
      { error: 'Conflict', message: 'This slug is already in use' },
      409
    );
  }

  const meetingType = await meetingTypeService.create({
    ownerId: user.id,
    ...data,
  });

  return c.json({ meetingType }, 201);
});

// Get single meeting type
app.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const meetingType = await meetingTypeService.getById(id);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  if (meetingType.ownerId !== user.id) {
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403);
  }

  return c.json({ meetingType });
});

// Update meeting type
app.patch('/:id', zValidator('json', updateMeetingTypeSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  // Check if slug is available (if being changed)
  if (data.slug) {
    const isAvailable = await meetingTypeService.isSlugAvailable(user.id, data.slug, id);
    if (!isAvailable) {
      return c.json(
        { error: 'Conflict', message: 'This slug is already in use' },
        409
      );
    }
  }

  const meetingType = await meetingTypeService.update(id, user.id, data);

  if (!meetingType) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  return c.json({ meetingType });
});

// Delete meeting type
app.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const deleted = await meetingTypeService.delete(id, user.id);

  if (!deleted) {
    return c.json({ error: 'Not Found', message: 'Meeting type not found' }, 404);
  }

  return c.json({ message: 'Meeting type deleted' });
});

export { app as meetingTypesRoutes };
