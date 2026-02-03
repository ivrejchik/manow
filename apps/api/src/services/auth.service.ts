import { eq, and, gt } from 'drizzle-orm';
import { hash, verify } from 'argon2';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase, encodeBase32LowerCaseNoPadding } from '@oslojs/encoding';
import { db, users, sessions, magicLinkTokens, type User, type Session } from '../db';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface CreateUserParams {
  email: string;
  name: string;
  password?: string;
  timezone?: string;
  googleId?: string;
  githubId?: string;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

function hashSessionToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

function generateMagicLinkToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(bytes);
}

export class AuthService {
  async createUser(params: CreateUserParams): Promise<User> {
    const passwordHash = params.password ? await hash(params.password) : null;

    const [user] = await db
      .insert(users)
      .values({
        email: params.email.toLowerCase(),
        name: params.name,
        timezone: params.timezone ?? 'UTC',
        passwordHash,
        googleId: params.googleId,
        githubId: params.githubId,
        emailVerified: !!params.googleId || !!params.githubId,
      })
      .returning();

    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return user ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user ?? null;
  }

  async getUserByGithubId(githubId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.githubId, githubId));
    return user ?? null;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) {
      return false;
    }
    return verify(user.passwordHash, password);
  }

  async createSession(
    userId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ session: Session; token: string }> {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const [session] = await db
      .insert(sessions)
      .values({
        userId,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      })
      .returning();

    return { session, token };
  }

  async validateSession(token: string): Promise<SessionWithUser | null> {
    const tokenHash = hashSessionToken(token);

    const result = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));

    if (result.length === 0) {
      return null;
    }

    const { sessions: session, users: user } = result[0];

    // Extend session if more than halfway through
    const halfwayPoint = new Date(session.expiresAt.getTime() - SESSION_DURATION_MS / 2);
    if (new Date() > halfwayPoint) {
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + SESSION_DURATION_MS) })
        .where(eq(sessions.id, session.id));
    }

    return { session, user };
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async createMagicLink(email: string): Promise<{ token: string; userId: string } | null> {
    const user = await this.getUserByEmail(email);
    if (!user) {
      return null;
    }

    const token = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_DURATION_MS);

    await db.insert(magicLinkTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    return { token, userId: user.id };
  }

  async verifyMagicLink(
    token: string
  ): Promise<{ user: User; session: Session; sessionToken: string } | null> {
    const [magicLink] = await db
      .select()
      .from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.token, token),
          gt(magicLinkTokens.expiresAt, new Date())
        )
      );

    if (!magicLink || magicLink.usedAt) {
      return null;
    }

    // Mark token as used
    await db
      .update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(eq(magicLinkTokens.id, magicLink.id));

    // Get user and mark email as verified
    const [user] = await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, magicLink.userId))
      .returning();

    // Create session
    const { session, token: sessionToken } = await this.createSession(user.id);

    return { user, session, sessionToken };
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ googleId, emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async linkGithubAccount(userId: string, githubId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ githubId, emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async updateUser(
    userId: string,
    updates: Partial<Pick<User, 'name' | 'timezone' | 'avatarUrl'>>
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await db.delete(sessions).where(gt(new Date(), sessions.expiresAt));
    return result.count ?? 0;
  }

  async cleanupExpiredMagicLinks(): Promise<number> {
    const result = await db
      .delete(magicLinkTokens)
      .where(gt(new Date(), magicLinkTokens.expiresAt));
    return result.count ?? 0;
  }
}

export const authService = new AuthService();
