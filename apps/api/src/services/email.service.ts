import {
  sendEmail,
  generateBookingConfirmationEmail,
  generateMagicLinkEmail,
  generateHostNotificationEmail,
} from '../lib/resend';
import { generateBookingIcs, formatDateTimeForEmail } from '../lib/ics';
import { uploadFile, generateDocumentKey } from '../lib/r2';
import { eventPublisher } from '../events/publisher';
import type { Booking, MeetingType, User } from '../db';

export interface SendBookingConfirmationParams {
  booking: Booking;
  meetingType: MeetingType;
  host: User;
}

export class EmailService {
  async sendBookingConfirmationToGuest(params: SendBookingConfirmationParams): Promise<string> {
    const { booking, meetingType, host } = params;

    // Generate ICS file
    const icsContent = generateBookingIcs({
      id: booking.id,
      meetingName: meetingType.name,
      hostName: host.name,
      hostEmail: host.email,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      slotStart: booking.slotStart,
      slotEnd: booking.slotEnd,
      hostTimezone: host.timezone,
      location: meetingType.locationText ?? undefined,
      notes: booking.guestNotes ?? undefined,
    });

    // Upload ICS file to R2
    const icsKey = generateDocumentKey('ics', booking.id, 'ics');
    const icsUrl = await uploadFile(icsKey, icsContent, 'text/calendar');

    // Generate email content
    const emailData = generateBookingConfirmationEmail({
      guestName: booking.guestName,
      hostName: host.name,
      meetingName: meetingType.name,
      dateTime: formatDateTimeForEmail(booking.slotStart, booking.guestTimezone),
      timezone: booking.guestTimezone,
      location: meetingType.locationText ?? undefined,
      icsDownloadUrl: icsUrl,
      cancelUrl: `${process.env.APP_URL}/booking/${booking.id}/cancel`,
    });

    // Send email
    const emailId = await sendEmail({
      to: booking.guestEmail,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    // Publish event
    await eventPublisher.publishEmailRequested({
      templateId: 'booking-confirmation-guest',
      to: booking.guestEmail,
      subject: emailData.subject,
      context: {
        bookingId: booking.id,
        guestName: booking.guestName,
        hostName: host.name,
      },
    });

    return emailId;
  }

  async sendBookingNotificationToHost(params: SendBookingConfirmationParams): Promise<string> {
    const { booking, meetingType, host } = params;

    const emailData = generateHostNotificationEmail({
      hostName: host.name,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      meetingName: meetingType.name,
      dateTime: formatDateTimeForEmail(booking.slotStart, host.timezone),
      timezone: host.timezone,
      location: meetingType.locationText ?? undefined,
      dashboardUrl: `${process.env.APP_URL}/dashboard/bookings/${booking.id}`,
    });

    const emailId = await sendEmail({
      to: host.email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    await eventPublisher.publishEmailRequested({
      templateId: 'booking-notification-host',
      to: host.email,
      subject: emailData.subject,
      context: {
        bookingId: booking.id,
        guestName: booking.guestName,
        hostName: host.name,
      },
    });

    return emailId;
  }

  async sendMagicLink(email: string, name: string, token: string): Promise<string> {
    const magicLinkUrl = `${process.env.APP_URL}/auth/verify?token=${token}`;

    const emailData = generateMagicLinkEmail({
      name,
      magicLinkUrl,
      expiresInMinutes: 15,
    });

    const emailId = await sendEmail({
      to: email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    return emailId;
  }

  async sendCancellationToGuest(
    booking: Booking,
    meetingType: MeetingType,
    host: User,
    reason?: string
  ): Promise<string> {
    const subject = `Canceled: ${meetingType.name} with ${host.name}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Booking Canceled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f87171; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Booking Canceled</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p>Hi ${booking.guestName},</p>

    <p>Your meeting has been canceled:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0;"><strong>Meeting:</strong> ${meetingType.name}</p>
      <p style="margin: 0 0 10px 0;"><strong>With:</strong> ${host.name}</p>
      <p style="margin: 0;"><strong>Was scheduled for:</strong> ${formatDateTimeForEmail(booking.slotStart, booking.guestTimezone)}</p>
    </div>

    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}

    <p>If you'd like to reschedule, you can book a new time:</p>

    <p>
      <a href="${process.env.APP_URL}/book/${meetingType.slug}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
        Book New Time
      </a>
    </p>
  </div>
</body>
</html>
    `.trim();

    const text = `
Hi ${booking.guestName},

Your meeting has been canceled:

Meeting: ${meetingType.name}
With: ${host.name}
Was scheduled for: ${formatDateTimeForEmail(booking.slotStart, booking.guestTimezone)}

${reason ? `Reason: ${reason}` : ''}

If you'd like to reschedule, you can book a new time at: ${process.env.APP_URL}/book/${meetingType.slug}
    `.trim();

    const emailId = await sendEmail({
      to: booking.guestEmail,
      subject,
      html,
      text,
    });

    return emailId;
  }

  async sendCancellationToHost(
    booking: Booking,
    meetingType: MeetingType,
    host: User,
    canceledBy: 'host' | 'guest' | 'system',
    reason?: string
  ): Promise<string> {
    const subject = `Canceled: ${meetingType.name} with ${booking.guestName}`;

    const canceledByText =
      canceledBy === 'host'
        ? 'You'
        : canceledBy === 'guest'
        ? booking.guestName
        : 'The system';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Booking Canceled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f87171; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Booking Canceled</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p>Hi ${host.name},</p>

    <p>${canceledByText} canceled the following meeting:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0;"><strong>Meeting:</strong> ${meetingType.name}</p>
      <p style="margin: 0 0 10px 0;"><strong>Guest:</strong> ${booking.guestName} (${booking.guestEmail})</p>
      <p style="margin: 0;"><strong>Was scheduled for:</strong> ${formatDateTimeForEmail(booking.slotStart, host.timezone)}</p>
    </div>

    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}

    <p>
      <a href="${process.env.APP_URL}/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
        View Dashboard
      </a>
    </p>
  </div>
</body>
</html>
    `.trim();

    const text = `
Hi ${host.name},

${canceledByText} canceled the following meeting:

Meeting: ${meetingType.name}
Guest: ${booking.guestName} (${booking.guestEmail})
Was scheduled for: ${formatDateTimeForEmail(booking.slotStart, host.timezone)}

${reason ? `Reason: ${reason}` : ''}

View your dashboard: ${process.env.APP_URL}/dashboard
    `.trim();

    const emailId = await sendEmail({
      to: host.email,
      subject,
      html,
      text,
    });

    return emailId;
  }
}

export const emailService = new EmailService();
