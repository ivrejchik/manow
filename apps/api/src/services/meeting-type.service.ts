import { eq, and } from 'drizzle-orm';
import { db, meetingTypes, users, type MeetingType, type User } from '../db';

export interface CreateMeetingTypeParams {
  ownerId: string;
  name: string;
  slug: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  locationText?: string;
  requiresNda?: boolean;
  ndaTemplateId?: string;
}

export interface UpdateMeetingTypeParams {
  name?: string;
  slug?: string;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  locationText?: string;
  requiresNda?: boolean;
  ndaTemplateId?: string;
  isActive?: boolean;
}

export interface MeetingTypeWithOwner extends MeetingType {
  owner: User;
}

export class MeetingTypeService {
  async create(params: CreateMeetingTypeParams): Promise<MeetingType> {
    const [meetingType] = await db
      .insert(meetingTypes)
      .values({
        ownerId: params.ownerId,
        name: params.name,
        slug: params.slug.toLowerCase(),
        durationMinutes: params.durationMinutes,
        bufferBeforeMinutes: params.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: params.bufferAfterMinutes ?? 0,
        locationText: params.locationText,
        requiresNda: params.requiresNda ?? false,
        ndaTemplateId: params.ndaTemplateId,
      })
      .returning();

    return meetingType;
  }

  async getById(id: string): Promise<MeetingType | null> {
    const [meetingType] = await db
      .select()
      .from(meetingTypes)
      .where(eq(meetingTypes.id, id));

    return meetingType ?? null;
  }

  async getByOwnerAndSlug(ownerId: string, slug: string): Promise<MeetingType | null> {
    const [meetingType] = await db
      .select()
      .from(meetingTypes)
      .where(
        and(eq(meetingTypes.ownerId, ownerId), eq(meetingTypes.slug, slug.toLowerCase()))
      );

    return meetingType ?? null;
  }

  async getBySlugWithOwner(slug: string): Promise<MeetingTypeWithOwner | null> {
    const result = await db
      .select()
      .from(meetingTypes)
      .innerJoin(users, eq(meetingTypes.ownerId, users.id))
      .where(and(eq(meetingTypes.slug, slug.toLowerCase()), eq(meetingTypes.isActive, true)));

    if (result.length === 0) {
      return null;
    }

    return {
      ...result[0].meeting_types,
      owner: result[0].users,
    };
  }

  async getByOwner(ownerId: string): Promise<MeetingType[]> {
    return db.select().from(meetingTypes).where(eq(meetingTypes.ownerId, ownerId));
  }

  async getActiveByOwner(ownerId: string): Promise<MeetingType[]> {
    return db
      .select()
      .from(meetingTypes)
      .where(and(eq(meetingTypes.ownerId, ownerId), eq(meetingTypes.isActive, true)));
  }

  async update(
    id: string,
    ownerId: string,
    params: UpdateMeetingTypeParams
  ): Promise<MeetingType | null> {
    const updateData: Partial<typeof meetingTypes.$inferInsert> = {};

    if (params.name !== undefined) updateData.name = params.name;
    if (params.slug !== undefined) updateData.slug = params.slug.toLowerCase();
    if (params.durationMinutes !== undefined) updateData.durationMinutes = params.durationMinutes;
    if (params.bufferBeforeMinutes !== undefined)
      updateData.bufferBeforeMinutes = params.bufferBeforeMinutes;
    if (params.bufferAfterMinutes !== undefined)
      updateData.bufferAfterMinutes = params.bufferAfterMinutes;
    if (params.locationText !== undefined) updateData.locationText = params.locationText;
    if (params.requiresNda !== undefined) updateData.requiresNda = params.requiresNda;
    if (params.ndaTemplateId !== undefined) updateData.ndaTemplateId = params.ndaTemplateId;
    if (params.isActive !== undefined) updateData.isActive = params.isActive;

    if (Object.keys(updateData).length === 0) {
      return this.getById(id);
    }

    const [meetingType] = await db
      .update(meetingTypes)
      .set(updateData)
      .where(and(eq(meetingTypes.id, id), eq(meetingTypes.ownerId, ownerId)))
      .returning();

    return meetingType ?? null;
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await db
      .delete(meetingTypes)
      .where(and(eq(meetingTypes.id, id), eq(meetingTypes.ownerId, ownerId)));

    return (result.count ?? 0) > 0;
  }

  async isSlugAvailable(ownerId: string, slug: string, excludeId?: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(meetingTypes)
      .where(
        and(eq(meetingTypes.ownerId, ownerId), eq(meetingTypes.slug, slug.toLowerCase()))
      );

    if (existing.length === 0) {
      return true;
    }

    // If we're updating and the slug belongs to the same meeting type, it's available
    return excludeId !== undefined && existing[0].id === excludeId;
  }
}

export const meetingTypeService = new MeetingTypeService();
