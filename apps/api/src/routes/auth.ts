import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Google, GitHub, generateState, generateCodeVerifier } from 'arctic';
import { authService } from '../services/auth.service';
import {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
} from '../middleware/auth';
import { authRateLimit } from '../middleware/rate-limit';

const app = new Hono();

// OAuth providers (initialized lazily)
let google: Google | null = null;
let github: GitHub | null = null;

function getGoogle(): Google {
  if (!google) {
    google = new Google(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.API_URL}/api/auth/google/callback`
    );
  }
  return google;
}

function getGitHub(): GitHub {
  if (!github) {
    github = new GitHub(
      process.env.GITHUB_CLIENT_ID!,
      process.env.GITHUB_CLIENT_SECRET!,
      `${process.env.API_URL}/api/auth/github/callback`
    );
  }
  return github;
}

// Schemas
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  timezone: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

// Register
app.post('/register', authRateLimit, zValidator('json', registerSchema), async (c) => {
  const data = c.req.valid('json');

  // Check if user already exists
  const existingUser = await authService.getUserByEmail(data.email);
  if (existingUser) {
    return c.json({ error: 'Conflict', message: 'Email already registered' }, 409);
  }

  const user = await authService.createUser({
    email: data.email,
    name: data.name,
    password: data.password,
    timezone: data.timezone,
  });

  // Create session
  const { session, token } = await authService.createSession(
    user.id,
    c.req.header('User-Agent'),
    c.req.header('X-Forwarded-For')?.split(',')[0].trim()
  );

  setSessionCookie(c, token, session.expiresAt);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
  });
});

// Login
app.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
  const data = c.req.valid('json');

  const user = await authService.getUserByEmail(data.email);
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Invalid credentials' }, 401);
  }

  const validPassword = await authService.verifyPassword(user, data.password);
  if (!validPassword) {
    return c.json({ error: 'Unauthorized', message: 'Invalid credentials' }, 401);
  }

  const { session, token } = await authService.createSession(
    user.id,
    c.req.header('User-Agent'),
    c.req.header('X-Forwarded-For')?.split(',')[0].trim()
  );

  setSessionCookie(c, token, session.expiresAt);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
  });
});

// Request magic link
app.post('/magic-link', authRateLimit, zValidator('json', magicLinkSchema), async (c) => {
  const data = c.req.valid('json');

  const result = await authService.createMagicLink(data.email);

  // Always return success to prevent email enumeration
  if (result) {
    // TODO: Send email with magic link
    // For now, log it in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Magic link for ${data.email}: ${process.env.APP_URL}/auth/verify?token=${result.token}`);
    }
  }

  return c.json({ message: 'If an account exists, a magic link has been sent.' });
});

// Verify magic link
app.get('/magic-link/verify', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.json({ error: 'Bad Request', message: 'Token required' }, 400);
  }

  const result = await authService.verifyMagicLink(token);

  if (!result) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }

  setSessionCookie(c, result.sessionToken, result.session.expiresAt);

  return c.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      timezone: result.user.timezone,
      emailVerified: result.user.emailVerified,
      avatarUrl: result.user.avatarUrl,
    },
  });
});

// Google OAuth
app.get('/google', async (c) => {
  const google = getGoogle();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const url = google.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'email',
    'profile',
  ]);

  // Store state and code verifier in cookies
  c.header(
    'Set-Cookie',
    `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  c.header(
    'Set-Cookie',
    `code_verifier=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );

  return c.redirect(url.toString());
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = c.req.header('Cookie')?.match(/oauth_state=([^;]+)/)?.[1];
  const codeVerifier = c.req.header('Cookie')?.match(/code_verifier=([^;]+)/)?.[1];

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.json({ error: 'Bad Request', message: 'Invalid OAuth callback' }, 400);
  }

  try {
    const google = getGoogle();
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = (await response.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Find or create user
    let user = await authService.getUserByGoogleId(googleUser.id);

    if (!user) {
      // Check if email already exists
      user = await authService.getUserByEmail(googleUser.email);

      if (user) {
        // Link Google account to existing user
        user = await authService.linkGoogleAccount(user.id, googleUser.id);
      } else {
        // Create new user
        user = await authService.createUser({
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id,
        });

        if (googleUser.picture) {
          user = await authService.updateUser(user.id, { avatarUrl: googleUser.picture });
        }
      }
    }

    const { session, token } = await authService.createSession(
      user.id,
      c.req.header('User-Agent'),
      c.req.header('X-Forwarded-For')?.split(',')[0].trim()
    );

    setSessionCookie(c, token, session.expiresAt);

    // Clear OAuth cookies
    c.header('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Max-Age=0');
    c.header('Set-Cookie', 'code_verifier=; Path=/; HttpOnly; Max-Age=0');

    return c.redirect(`${process.env.APP_URL}/dashboard`);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return c.redirect(`${process.env.APP_URL}/auth/error?message=oauth_failed`);
  }
});

// GitHub OAuth
app.get('/github', async (c) => {
  const github = getGitHub();
  const state = generateState();

  const url = github.createAuthorizationURL(state, ['user:email']);

  c.header(
    'Set-Cookie',
    `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );

  return c.redirect(url.toString());
});

app.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = c.req.header('Cookie')?.match(/oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== storedState) {
    return c.json({ error: 'Bad Request', message: 'Invalid OAuth callback' }, 400);
  }

  try {
    const github = getGitHub();
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Fetch user info
    const [userResponse, emailsResponse] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const githubUser = (await userResponse.json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    };

    const emails = (await emailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    const primaryEmail = emails.find((e) => e.primary && e.verified)?.email;
    if (!primaryEmail) {
      return c.redirect(`${process.env.APP_URL}/auth/error?message=no_verified_email`);
    }

    // Find or create user
    let user = await authService.getUserByGithubId(String(githubUser.id));

    if (!user) {
      user = await authService.getUserByEmail(primaryEmail);

      if (user) {
        user = await authService.linkGithubAccount(user.id, String(githubUser.id));
      } else {
        user = await authService.createUser({
          email: primaryEmail,
          name: githubUser.name || githubUser.login,
          githubId: String(githubUser.id),
        });

        user = await authService.updateUser(user.id, { avatarUrl: githubUser.avatar_url });
      }
    }

    const { session, token } = await authService.createSession(
      user.id,
      c.req.header('User-Agent'),
      c.req.header('X-Forwarded-For')?.split(',')[0].trim()
    );

    setSessionCookie(c, token, session.expiresAt);
    c.header('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Max-Age=0');

    return c.redirect(`${process.env.APP_URL}/dashboard`);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return c.redirect(`${process.env.APP_URL}/auth/error?message=oauth_failed`);
  }
});

// Logout
app.post('/logout', requireAuth, async (c) => {
  const session = c.get('session');
  await authService.invalidateSession(session.id);
  clearSessionCookie(c);
  return c.json({ message: 'Logged out' });
});

// Get current user
app.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
  });
});

// Update current user
app.patch(
  '/me',
  requireAuth,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(255).optional(),
      timezone: z.string().min(1).max(100).optional(),
    })
  ),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');

    const updatedUser = await authService.updateUser(user.id, data);

    return c.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        timezone: updatedUser.timezone,
        emailVerified: updatedUser.emailVerified,
        avatarUrl: updatedUser.avatarUrl,
      },
    });
  }
);

export { app as authRoutes };
