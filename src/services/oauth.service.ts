import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types/bindings";
import type { TokenRequestInput } from "../schemas/oauth.schema";
import type {
  OAuthClientRecord,
  OAuthCodeRecord,
  TokenResponse,
  UserInfoResponse,
  AppRecord,
} from "../types/oauth";
import { getSupabaseAdmin } from "../utils/supabase";
import { verifyClientSecret, verifyPkce } from "../utils/crypto";
import { signAccessToken, verifyAccessToken } from "../utils/jwt";

export class OAuthService {
  /**
   * Đổi Authorization Code lấy Access Token
   * Hỗ trợ cả app_id (mới) và client_id (legacy)
   */
  static async exchangeToken(
    env: Bindings,
    input: TokenRequestInput,
  ): Promise<TokenResponse> {
    const supabase = getSupabaseAdmin(env);
    
    // Xác định app_id (ưu tiên app_id, fallback client_id)
    const appId = input.app_id || input.client_id;
    if (!appId) {
      throw new HTTPException(400, {
        message: "Cần cung cấp app_id hoặc client_id",
      });
    }

    // 1. Tìm App từ bảng apps (mới) hoặc oauth_clients (legacy)
    let app: any = null;
    
    // Cố gắng lấy từ bảng apps mới trước
    const { data: appData, error: appErr } = await supabase
      .from("apps")
      .select("*")
      .eq("id", appId)
      .maybeSingle<AppRecord>();

    if (appErr) {
      console.error("Error querying apps table:", appErr);
    }

    // Fallback: nếu không tìm thấy trong apps, thử oauth_clients (legacy)
    if (!appData && input.client_id) {
      const { data: legacyClient } = await supabase
        .from("oauth_clients")
        .select("*")
        .eq("client_id", input.client_id)
        .maybeSingle<OAuthClientRecord>();
      
      app = legacyClient;
    } else {
      app = appData;
    }

    if (!app) {
      throw new HTTPException(401, {
        message: "App không hợp lệ hoặc chưa đăng ký trong hệ thống",
      });
    }

    // 2. Kiểm tra app status (nếu là bảng apps)
    if (app.status && app.status !== "active") {
      throw new HTTPException(403, {
        message: "App hiện không hoạt động",
      });
    }

    // 3. Xác thực Secret (app_secret mới hoặc client_secret_hash legacy)
    const secret = input.app_secret || input.client_secret;
    const secretHash = app.app_secret || app.client_secret_hash;
    
    if (secretHash) {
      // Nếu app có secret, phải validate
      const isSecretValid = await verifyClientSecret(secret, secretHash);
      if (!isSecretValid) {
        throw new HTTPException(401, {
          message: "app_secret/client_secret không chính xác hoặc thiếu",
        });
      }
    }

    // 4. Kiểm tra redirect_uri có hợp lệ không
    const redirectUris = app.redirect_uris || [];
    const isRedirectAllowed = redirectUris.some((uri: string) => {
      try {
        const u1 = new URL(uri);
        const u2 = new URL(input.redirect_uri);
        return u1.origin === u2.origin && u1.pathname === u2.pathname;
      } catch {
        return uri === input.redirect_uri;
      }
    });

    if (!isRedirectAllowed) {
      throw new HTTPException(400, {
        message: "redirect_uri không khớp với các URI đã đăng ký",
      });
    }

    // 5. Kiểm tra Authorization Code
    const { data: codeRecord, error: codeErr } = await supabase
      .from("oauth_codes")
      .select("*")
      .eq("code", input.code)
      .eq("client_id", appId) // Tìm code với app_id/client_id
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<OAuthCodeRecord>();

    if (codeErr || !codeRecord || codeRecord.redirect_uri !== input.redirect_uri) {
      throw new HTTPException(400, {
        message: "Auth code không hợp lệ, đã hết hạn hoặc redirect_uri không khớp",
      });
    }

    // 6. Xác thực PKCE S256 nếu code có code_challenge
    if (codeRecord.code_challenge) {
      if (!input.code_verifier) {
        throw new HTTPException(400, {
          message: "Yêu cầu cung cấp code_verifier để xác thực PKCE",
        });
      }

      const isPkceValid = await verifyPkce(
        input.code_verifier,
        codeRecord.code_challenge,
        codeRecord.code_challenge_method || "S256",
      );

      if (!isPkceValid) {
        throw new HTTPException(400, {
          message: "code_verifier không khớp với code_challenge đã đăng ký",
        });
      }
    }

    // 7. Đánh dấu Auth Code đã sử dụng (chống Replay Attack)
    await supabase
      .from("oauth_codes")
      .update({ used: true })
      .eq("code", input.code);

    // 8. Cấp Access Token JWT
    const { accessToken, expiresIn } = await signAccessToken(env, {
      userId: codeRecord.user_id,
      clientId: appId,
      appId: appId,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: "openid profile email",
    };
  }

  /**
   * Truy vấn thông tin người dùng từ Bearer Token
   * Hỗ trợ role/permission dựa trên app_id (từ X-App-Id header hoặc query param)
   */
  static async getUserInfo(
    env: Bindings,
    token: string,
    appId?: string,
  ): Promise<UserInfoResponse> {
    const claims = await verifyAccessToken(env, token).catch(() => {
      throw new HTTPException(401, {
        message: "Access token đã hết hạn hoặc chữ ký không hợp lệ",
      });
    });

    const supabase = getSupabaseAdmin(env);

    // Query user profile từ Supabase Auth qua admin API
    let userInfo: UserInfoResponse = {
      sub: claims.sub,
      email: claims.email,
      email_verified: true,
      name: claims.name || "User",
      avatar: claims.avatar || null,
      picture: claims.avatar || null,
    };

    try {
      const { data, error } = await supabase.auth.admin.getUserById(claims.sub);
      if (!error && data?.user) {
        const u = data.user;
        const meta = u.user_metadata || {};
        userInfo = {
          sub: u.id,
          email: u.email,
          email_verified: Boolean(u.email_confirmed_at),
          name: meta.full_name || meta.name || u.email?.split("@")[0] || "User",
          avatar: meta.avatar_url || meta.picture || null,
          picture: meta.avatar_url || meta.picture || null,
        };
      }
    } catch {
      // Fallback nếu không có service key admin
    }

    // 2. Nếu có app_id, lấy thêm roles và permissions
    if (appId) {
      const { data: app } = await supabase
        .from("apps")
        .select("roles, permissions")
        .eq("id", appId)
        .maybeSingle<{ roles: string[]; permissions: Record<string, string[]> }>();

      if (app) {
        userInfo.app_id = appId;
        
        // Mặc định gán role 'user' nếu user đã verify
        const userRole = userInfo.email_verified ? "user" : "guest";
        userInfo.roles = [userRole];

        // Lấy permissions theo role
        if (app.permissions && app.permissions[userRole]) {
          userInfo.permissions = app.permissions[userRole];
        }
      }
    }

    return userInfo;
  }
}
