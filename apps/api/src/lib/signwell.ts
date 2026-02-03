export interface SignWellRecipient {
  id: string;
  email: string;
  name: string;
  placeholder_name?: string;
}

export interface CreateDocumentResponse {
  id: string;
  name: string;
  status: string;
  recipients: Array<{
    id: string;
    email: string;
    name: string;
    embedded_signing_url?: string;
  }>;
}

export interface SignWellConfig {
  apiKey: string;
  testMode: boolean;
}

const SIGNWELL_API_URL = 'https://www.signwell.com/api/v1';

function getConfig(): SignWellConfig {
  const apiKey = process.env.SIGNWELL_API_KEY;
  if (!apiKey) {
    throw new Error('SIGNWELL_API_KEY environment variable is required');
  }

  return {
    apiKey,
    testMode: process.env.NODE_ENV !== 'production',
  };
}

export async function createNdaEnvelope(
  holdId: string,
  signerEmail: string,
  signerName: string,
  templateId?: string
): Promise<{ envelopeId: string; signUrl: string }> {
  const config = getConfig();
  const ndaTemplateId = templateId || process.env.NDA_TEMPLATE_ID;

  if (!ndaTemplateId) {
    throw new Error('NDA_TEMPLATE_ID environment variable is required');
  }

  const response = await fetch(`${SIGNWELL_API_URL}/documents`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      test_mode: config.testMode,
      name: `NDA - Meeting Booking ${holdId}`,
      template_id: ndaTemplateId,
      recipients: [
        {
          id: 'signer',
          email: signerEmail,
          name: signerName,
          placeholder_name: 'Signer',
        },
      ],
      custom_fields: {
        hold_id: holdId,
      },
      embedded_signing: true,
      embedded_signing_notifications: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('SignWell API error:', error);
    throw new Error(`SignWell API error: ${response.status}`);
  }

  const data = (await response.json()) as CreateDocumentResponse;

  const signUrl = data.recipients[0]?.embedded_signing_url;
  if (!signUrl) {
    throw new Error('No signing URL returned from SignWell');
  }

  return {
    envelopeId: data.id,
    signUrl,
  };
}

export async function getDocument(documentId: string): Promise<{
  id: string;
  status: string;
  completed_at?: string;
}> {
  const config = getConfig();

  const response = await fetch(`${SIGNWELL_API_URL}/documents/${documentId}`, {
    headers: {
      'X-Api-Key': config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`SignWell API error: ${response.status}`);
  }

  return response.json();
}

export async function getSignedDocumentUrl(documentId: string): Promise<string | null> {
  const config = getConfig();

  const response = await fetch(`${SIGNWELL_API_URL}/documents/${documentId}/completed_pdf`, {
    headers: {
      'X-Api-Key': config.apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`SignWell API error: ${response.status}`);
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}

export async function cancelDocument(documentId: string): Promise<boolean> {
  const config = getConfig();

  const response = await fetch(`${SIGNWELL_API_URL}/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      'X-Api-Key': config.apiKey,
    },
  });

  return response.ok;
}
