import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendEmail(params: EmailParams): Promise<string> {
  const resend = getResend();

  if (!resend) {
    console.log(`[Dev Mode] Would send email to ${params.to}: ${params.subject}`);
    return `dev-email-${Date.now()}`;
  }

  const fromAddress = params.from || process.env.EMAIL_FROM || 'noreply@example.com';

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    reply_to: params.replyTo,
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data!.id;
}

// Email templates

export interface BookingConfirmationEmailData {
  guestName: string;
  hostName: string;
  meetingName: string;
  dateTime: string;
  timezone: string;
  location?: string;
  icsDownloadUrl: string;
  cancelUrl?: string;
}

export function generateBookingConfirmationEmail(data: BookingConfirmationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Confirmed: ${data.meetingName} with ${data.hostName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Booking Confirmed</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="margin-top: 0;">Hi ${data.guestName},</p>

    <p>Your meeting has been confirmed. Here are the details:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0;"><strong>Meeting:</strong> ${data.meetingName}</p>
      <p style="margin: 0 0 10px 0;"><strong>With:</strong> ${data.hostName}</p>
      <p style="margin: 0 0 10px 0;"><strong>When:</strong> ${data.dateTime} (${data.timezone})</p>
      ${data.location ? `<p style="margin: 0;"><strong>Where:</strong> ${data.location}</p>` : ''}
    </div>

    <p>
      <a href="${data.icsDownloadUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
        Add to Calendar
      </a>
    </p>

    ${data.cancelUrl ? `
    <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
      Need to cancel? <a href="${data.cancelUrl}" style="color: #667eea;">Click here</a>
    </p>
    ` : ''}

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This email was sent by Meeting Scheduler
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Booking Confirmed

Hi ${data.guestName},

Your meeting has been confirmed. Here are the details:

Meeting: ${data.meetingName}
With: ${data.hostName}
When: ${data.dateTime} (${data.timezone})
${data.location ? `Where: ${data.location}` : ''}

Add to your calendar: ${data.icsDownloadUrl}
${data.cancelUrl ? `\nNeed to cancel? ${data.cancelUrl}` : ''}
  `.trim();

  return { subject, html, text };
}

export interface MagicLinkEmailData {
  name: string;
  magicLinkUrl: string;
  expiresInMinutes: number;
}

export function generateMagicLinkEmail(data: MagicLinkEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Your login link';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Link</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Login Link</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="margin-top: 0;">Hi ${data.name},</p>

    <p>Click the button below to log in to your account:</p>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${data.magicLinkUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
        Log In
      </a>
    </p>

    <p style="font-size: 14px; color: #6b7280;">
      This link will expire in ${data.expiresInMinutes} minutes.
    </p>

    <p style="font-size: 14px; color: #6b7280;">
      If you didn't request this link, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This email was sent by Meeting Scheduler
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${data.name},

Click the link below to log in to your account:

${data.magicLinkUrl}

This link will expire in ${data.expiresInMinutes} minutes.

If you didn't request this link, you can safely ignore this email.
  `.trim();

  return { subject, html, text };
}

export interface HostNotificationEmailData {
  hostName: string;
  guestName: string;
  guestEmail: string;
  meetingName: string;
  dateTime: string;
  timezone: string;
  location?: string;
  dashboardUrl: string;
}

export function generateHostNotificationEmail(data: HostNotificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `New booking: ${data.meetingName} with ${data.guestName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Booking</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="margin-top: 0;">Hi ${data.hostName},</p>

    <p>You have a new booking! Here are the details:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0;"><strong>Meeting:</strong> ${data.meetingName}</p>
      <p style="margin: 0 0 10px 0;"><strong>Guest:</strong> ${data.guestName} (${data.guestEmail})</p>
      <p style="margin: 0 0 10px 0;"><strong>When:</strong> ${data.dateTime} (${data.timezone})</p>
      ${data.location ? `<p style="margin: 0;"><strong>Where:</strong> ${data.location}</p>` : ''}
    </div>

    <p>
      <a href="${data.dashboardUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
        View in Dashboard
      </a>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This email was sent by Meeting Scheduler
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${data.hostName},

You have a new booking! Here are the details:

Meeting: ${data.meetingName}
Guest: ${data.guestName} (${data.guestEmail})
When: ${data.dateTime} (${data.timezone})
${data.location ? `Where: ${data.location}` : ''}

View in dashboard: ${data.dashboardUrl}
  `.trim();

  return { subject, html, text };
}
