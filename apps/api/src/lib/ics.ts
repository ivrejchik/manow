import icalGenerator, { ICalCalendar, ICalEventStatus } from 'ical-generator';
import { DateTime } from 'luxon';

export interface CalendarEventData {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  organizer: {
    name: string;
    email: string;
  };
  attendees: Array<{
    name: string;
    email: string;
  }>;
}

export function generateIcsCalendar(event: CalendarEventData): string {
  const calendar = icalGenerator({
    name: 'Meeting Scheduler',
    prodId: '//Meeting Scheduler//EN',
  });

  const icalEvent = calendar.createEvent({
    id: event.id,
    start: event.startTime,
    end: event.endTime,
    timezone: event.timezone,
    summary: event.title,
    description: event.description,
    location: event.location,
    organizer: {
      name: event.organizer.name,
      email: event.organizer.email,
    },
    status: ICalEventStatus.CONFIRMED,
  });

  // Add attendees
  for (const attendee of event.attendees) {
    icalEvent.createAttendee({
      name: attendee.name,
      email: attendee.email,
      rsvp: true,
    });
  }

  return calendar.toString();
}

export function generateBookingIcs(booking: {
  id: string;
  meetingName: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  guestEmail: string;
  slotStart: Date;
  slotEnd: Date;
  hostTimezone: string;
  location?: string;
  notes?: string;
}): string {
  const description = booking.notes
    ? `Notes from ${booking.guestName}:\n${booking.notes}`
    : undefined;

  return generateIcsCalendar({
    id: booking.id,
    title: `${booking.meetingName} - ${booking.guestName} & ${booking.hostName}`,
    description,
    location: booking.location,
    startTime: booking.slotStart,
    endTime: booking.slotEnd,
    timezone: booking.hostTimezone,
    organizer: {
      name: booking.hostName,
      email: booking.hostEmail,
    },
    attendees: [
      { name: booking.hostName, email: booking.hostEmail },
      { name: booking.guestName, email: booking.guestEmail },
    ],
  });
}

export function formatDateTimeForEmail(
  date: Date,
  timezone: string,
  format: 'long' | 'short' = 'long'
): string {
  const dt = DateTime.fromJSDate(date).setZone(timezone);

  if (format === 'long') {
    return dt.toFormat('cccc, LLLL d, yyyy \'at\' h:mm a');
  }

  return dt.toFormat('LLL d, h:mm a');
}
