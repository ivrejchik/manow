const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, response.statusText, body);
  }

  return response.json();
}

// Auth
export const auth = {
  register: (data: { email: string; name: string; password: string; timezone?: string }) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),

  me: () => request<{ user: User }>('/auth/me'),

  requestMagicLink: (email: string) =>
    request<{ message: string }>('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

// Meeting Types
export const meetingTypes = {
  list: () => request<{ meetingTypes: MeetingType[] }>('/meeting-types'),

  get: (id: string) => request<{ meetingType: MeetingType }>(`/meeting-types/${id}`),

  create: (data: CreateMeetingTypeInput) =>
    request<{ meetingType: MeetingType }>('/meeting-types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateMeetingTypeInput>) =>
    request<{ meetingType: MeetingType }>(`/meeting-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/meeting-types/${id}`, {
      method: 'DELETE',
    }),
};

// Availability
export const availability = {
  getRules: () => request<{ rules: AvailabilityRule[] }>('/availability/rules'),

  createRule: (data: CreateAvailabilityRuleInput) =>
    request<{ rule: AvailabilityRule }>('/availability/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteRule: (id: string) =>
    request<{ message: string }>(`/availability/rules/${id}`, {
      method: 'DELETE',
    }),

  getBlackouts: () => request<{ blackouts: BlackoutDate[] }>('/availability/blackouts'),

  createBlackout: (data: CreateBlackoutDateInput) =>
    request<{ blackout: BlackoutDate }>('/availability/blackouts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteBlackout: (id: string) =>
    request<{ message: string }>(`/availability/blackouts/${id}`, {
      method: 'DELETE',
    }),
};

// Bookings
export const bookings = {
  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const query = searchParams.toString();
    return request<{ bookings: Booking[] }>(`/bookings${query ? `?${query}` : ''}`);
  },

  getUpcoming: (limit = 10) =>
    request<{ bookings: Booking[] }>(`/bookings/upcoming?limit=${limit}`),

  getStats: () =>
    request<{
      stats: { total: number; upcoming: number; completed: number; canceled: number };
    }>('/bookings/stats'),

  get: (id: string) => request<{ booking: Booking }>(`/bookings/${id}`),

  cancel: (id: string, reason?: string) =>
    request<{ message: string; booking: Booking }>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// Public Booking
export const publicBooking = {
  getMeetingType: (slug: string) =>
    request<{ meetingType: PublicMeetingType }>(`/book/${slug}`),

  getSlots: (slug: string, params: { startDate: string; endDate: string; timezone: string }) => {
    const searchParams = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      timezone: params.timezone,
    });
    return request<{ slots: AvailableSlot[] }>(`/book/${slug}/slots?${searchParams}`);
  },

  createHold: (
    slug: string,
    data: { slotStart: string; slotEnd: string; email: string; name?: string; idempotencyKey: string }
  ) =>
    request<{ holdId: string; expiresAt: string; ndaRequired: boolean }>(`/book/${slug}/hold`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHold: (slug: string, holdId: string) =>
    request<{
      hold: { id: string; status: string; slotStart: string; slotEnd: string; expiresAt: string };
    }>(`/book/${slug}/hold/${holdId}`),

  releaseHold: (slug: string, holdId: string) =>
    request<{ message: string }>(`/book/${slug}/hold/${holdId}`, {
      method: 'DELETE',
    }),

  confirmBooking: (
    slug: string,
    data: {
      holdId: string;
      guestName: string;
      guestTimezone: string;
      guestNotes?: string;
      idempotencyKey: string;
    }
  ) =>
    request<{ booking: ConfirmedBooking }>(`/book/${slug}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface MeetingType {
  id: string;
  name: string;
  slug: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locationText: string | null;
  requiresNda: boolean;
  ndaTemplateId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateMeetingTypeInput {
  name: string;
  slug: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  locationText?: string;
  requiresNda?: boolean;
  ndaTemplateId?: string;
}

export interface AvailabilityRule {
  id: string;
  meetingTypeId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}

export interface CreateAvailabilityRuleInput {
  meetingTypeId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export interface BlackoutDate {
  id: string;
  blackoutDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  isRecurringYearly: boolean;
}

export interface CreateBlackoutDateInput {
  blackoutDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  isRecurringYearly?: boolean;
}

export interface Booking {
  id: string;
  slotStart: string;
  slotEnd: string;
  guestEmail: string;
  guestName: string;
  guestTimezone: string;
  guestNotes: string | null;
  status: 'confirmed' | 'canceled' | 'completed' | 'no_show';
  meetingType: {
    id: string;
    name: string;
    slug: string;
    durationMinutes: number;
    locationText: string | null;
  };
  createdAt: string;
}

export interface PublicMeetingType {
  id: string;
  name: string;
  slug: string;
  durationMinutes: number;
  locationText: string | null;
  requiresNda: boolean;
  hostName: string;
  hostTimezone: string;
}

export interface AvailableSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface ConfirmedBooking {
  id: string;
  slotStart: string;
  slotEnd: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  guestEmail: string;
  locationText: string | null;
}
