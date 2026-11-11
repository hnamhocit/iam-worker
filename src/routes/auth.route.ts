import { Hono } from "hono";
import type { AppEnv } from "../types/bindings";
import { AuthService } from "../services/auth.service";
import { HTTPException } from "hono/http-exception";

const app = new Hono<AppEnv>();

/**
 * Initiate SSO login flow
 */
app.get("/login", async (c) => {
  const { url, state, codeVerifier } = AuthService.getAuthorizationUrl(c.env);
  
  // Store state and codeVerifier in secure session
  await c.env.OAUTH_CACHE?.put(`oauth:${state}`, codeVerifier, {
    expirationTtl: 300, // 5 minutes
  });

  return c.redirect(url);
});

/**
 * Handle OAuth callback
 */
app.get("/callback", async (c) => {
  const { code, state } = c.req.query();
  const error = c.req.query("error");

  if (error) {
    throw new HTTPException(401, { 
      message: `OAuth error: ${error}` 
    });
  }

  if (!code || !state) {
    throw new HTTPException(400, { 
      message: "Missing code or state parameter" 
    });
  }

  // Verify state and retrieve codeVerifier
  const codeVerifier = await c.env.OAUTH_CACHE?.get(`oauth:${state}`);
  if (!codeVerifier) {
    throw new HTTPException(400, { 
      message: "Invalid or expired state" 
    });
  }

  // Exchange code for token
  const { access_token, expires_in } = await AuthService.exchangeCodeForToken(
    c.env,
    code,
    codeVerifier
  );

  // Get user info
  const userInfo = await AuthService.getUserInfo(c.env, access_token);

  // Store user session (implementation depends on your session management)
  // ...

  // Clean up
  await c.env.OAUTH_CACHE?.delete(`oauth:${state}`);

  return c.redirect("/");
});

/**
 * Handle logout
 */
app.get("/logout", (c) => {
  // Clear local session
  // ...

  // Redirect to VNTEZ IAM for global logout
  const logoutUrl = new URL(`${c.env.NEXT_PUBLIC_VNTEZ_IAM_URL}/auth/logout`);
  logoutUrl.searchParams.append("redirect_url", new URL(c.req.url).origin);
  
  return c.redirect(logoutUrl.toString());
});

export default app;
