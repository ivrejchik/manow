import { eq } from 'drizzle-orm';
import { db, documents, slotHolds, meetingTypes, type Document } from '../db';
import { createNdaEnvelope, getSignedDocumentUrl } from '../lib/signwell';
import { eventPublisher } from '../events/publisher';

export interface CreateNdaParams {
  holdId: string;
  signerEmail: string;
  signerName: string;
}

export interface NdaResult {
  success: boolean;
  document?: Document;
  signUrl?: string;
  error?: string;
}

export class NdaService {
  async createNda(params: CreateNdaParams): Promise<NdaResult> {
    const { holdId, signerEmail, signerName } = params;

    // Verify hold exists and is active
    const [hold] = await db
      .select()
      .from(slotHolds)
      .where(eq(slotHolds.id, holdId));

    if (!hold) {
      return { success: false, error: 'Hold not found' };
    }

    if (hold.status !== 'active') {
      return { success: false, error: `Hold is ${hold.status}` };
    }

    // Check if NDA already exists for this hold
    const [existingDoc] = await db
      .select()
      .from(documents)
      .where(eq(documents.holdId, holdId));

    if (existingDoc) {
      // If document is signed, return success
      if (existingDoc.status === 'signed') {
        return { success: true, document: existingDoc };
      }

      // If document is pending or sent, we could return the existing sign URL
      // For now, create a new document
    }

    // Get meeting type to find NDA template
    const [meetingType] = await db
      .select()
      .from(meetingTypes)
      .where(eq(meetingTypes.id, hold.meetingTypeId));

    if (!meetingType?.requiresNda) {
      return { success: false, error: 'Meeting type does not require NDA' };
    }

    try {
      // Create NDA envelope in SignWell
      const { envelopeId, signUrl } = await createNdaEnvelope(
        holdId,
        signerEmail,
        signerName,
        meetingType.ndaTemplateId ?? undefined
      );

      // Create document record
      const [document] = await db
        .insert(documents)
        .values({
          holdId,
          signerEmail: signerEmail.toLowerCase(),
          signerName,
          externalEnvelopeId: envelopeId,
          status: 'pending',
        })
        .returning();

      // Publish event
      await eventPublisher.publishNdaCreated({
        documentId: document.id,
        holdId,
        signerEmail: signerEmail.toLowerCase(),
        signerName,
      });

      return {
        success: true,
        document,
        signUrl,
      };
    } catch (error) {
      console.error('Error creating NDA:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create NDA',
      };
    }
  }

  async getDocumentByHoldId(holdId: string): Promise<Document | null> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.holdId, holdId));

    return document ?? null;
  }

  async getDocumentById(documentId: string): Promise<Document | null> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    return document ?? null;
  }

  async isNdaSigned(holdId: string): Promise<boolean> {
    const document = await this.getDocumentByHoldId(holdId);
    return document?.status === 'signed';
  }

  async getSignedDocumentUrl(documentId: string): Promise<string | null> {
    const document = await this.getDocumentById(documentId);

    if (!document) {
      return null;
    }

    // If we have a cached signed URL, return it
    if (document.signedStorageUrl) {
      return document.signedStorageUrl;
    }

    // Otherwise, fetch from SignWell
    if (document.externalEnvelopeId) {
      try {
        const url = await getSignedDocumentUrl(document.externalEnvelopeId);
        return url;
      } catch (error) {
        console.error('Error fetching signed document URL:', error);
        return null;
      }
    }

    return null;
  }

  async updateDocumentStatus(
    documentId: string,
    status: 'pending' | 'sent' | 'signed' | 'expired' | 'revoked',
    additionalData?: {
      signedAt?: Date;
      signedStorageUrl?: string;
      signerIpAddress?: string;
      auditData?: Record<string, unknown>;
    }
  ): Promise<Document | null> {
    const updateData: Partial<typeof documents.$inferInsert> = {
      status,
      ...additionalData,
    };

    const [document] = await db
      .update(documents)
      .set(updateData)
      .where(eq(documents.id, documentId))
      .returning();

    return document ?? null;
  }
}

export const ndaService = new NdaService();
