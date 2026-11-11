import type { Bindings } from "../types/bindings";
import { HTTPException } from "hono/http-exception";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "../utils/crypto";

export class AuthService {
  /**
   * Generate authorization URL for VNTEZ IAM SSO
   */
  static async getAuthorizationUrl(env: Bindings): Promise<{ url: string; state: string; codeVerifier: string }> {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const url = new URL(`${env.NEXT_PUBLIC_VNTEZ_IAM_URL}/oauth/authorize`);
    url.searchParams.append("client_id", env.NEXT_PUBLIC_VNTEZ_CLIENT_ID);
    url.searchParams.append("redirect_uri", env.NEXT_PUBLIC_VNTEZ_REDIRECT_URI);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("state", state);
    url.searchParams.append("code_challenge", codeChallenge);
    url.searchParams.append("code_challenge_method", "S256");
    url.searchParams.append("scope", "openid profile email roles permissions");

    return { 
      url: url.toString(),
      state,
      codeVerifier 
    };
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(
    env: Bindings,
    code: string,
    codeVerifier: string
  ): Promise<{ access_token: string; expires_in: number }> {
    const response = await fetch(`${env.NEXT_PUBLIC_VNTEZ_IAM_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: env.NEXT_PUBLIC_VNTEZ_CLIENT_ID,
        code_verifier: codeVerifier,
        redirect_uri: env.NEXT_PUBLIC_VNTEZ_REDIRECT_URI,
        client_secret: env.VNTEZ_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      throw new HTTPException(401, { 
        message: "Failed to exchange authorization code" 
      });
    }

    return response.json();
  }

  /**
   * Get user info from access token
   */
  static async getUserInfo(
    env: Bindings,
    accessToken: string
  ): Promise<{
    sub: string;
    email?: string;
    name: string;
    avatar?: string | null;
    roles: string[];
    permissions: string[];
  }> {
    const response = await fetch(`${env.NEXT_PUBLIC_VNTEZ_IAM_URL}/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-App-Id": env.NEXT_PUBLIC_VNTEZ_CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new HTTPException(401, { 
        message: "Failed to fetch user info" 
      });
    }

    return response.json();
  }
}
