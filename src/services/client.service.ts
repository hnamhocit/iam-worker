import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types/bindings";
import type { CreateClientInput } from "../schemas/oauth.schema";
import type { AppRecord } from "../types/oauth";
import { getSupabaseAdmin } from "../utils/supabase";
import { generateRandomString, sha256Hex } from "../utils/crypto";

export class ClientService {
  /**
   * Lấy danh sách toàn bộ Ứng dụng từ bảng apps
   */
  static async listClients(env: Bindings): Promise<AppRecord[]> {
    const supabase = getSupabaseAdmin(env);
    const { data, error } = await supabase
      .from("apps")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new HTTPException(500, { message: `Lỗi truy vấn apps: ${error.message}` });
    }

    return (data || []).map((app: any) => ({
      ...app,
      client_id: app.id,
    })) as AppRecord[];
  }

  /**
   * Lấy chi tiết ứng dụng theo app_id / id
   */
  static async getClient(env: Bindings, appId: string): Promise<AppRecord | null> {
    const supabase = getSupabaseAdmin(env);
    const { data, error } = await supabase
      .from("apps")
      .select("*")
      .eq("id", appId)
      .maybeSingle<AppRecord>();

    if (error) {
      throw new HTTPException(500, { message: `Lỗi truy vấn app: ${error.message}` });
    }

    if (!data) return null;
    return {
      ...data,
      client_id: data.id,
    };
  }

  /**
   * Tạo Ứng dụng mới trong bảng apps
   */
  static async createClient(
    env: Bindings,
    input: CreateClientInput,
  ): Promise<{ client: AppRecord; generatedSecret: string | null }> {
    const supabase = getSupabaseAdmin(env);
    const rawId = (input as any).id || (input as any).app_id || (input as any).client_id;
    const appId = rawId ? String(rawId).trim() : `vntez_${generateRandomString(12)}`;

    let generatedSecret: string | null = null;
    let clientSecretHash: string | null = null;

    if (input.is_confidential) {
      generatedSecret = `vntez_sec_${generateRandomString(24)}`;
      clientSecretHash = await sha256Hex(generatedSecret);
    }

    const payload: Record<string, any> = {
      id: appId,
      name: input.name,
      redirect_uris: input.redirect_uris,
      status: "active",
      is_internal: input.is_internal || false,
      roles: ["user"],
      permissions: { user: ["read:profile", "read:email"] },
    };

    if (clientSecretHash) payload.app_secret = clientSecretHash;
    if (input.description) payload.description = input.description;
    if (input.logo_url) payload.logo_url = input.logo_url;

    const attemptPayload = { ...payload };

    // Tự động retry nếu PostgREST chưa kịp reload schema cache cho các cột mới
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("apps")
        .insert([attemptPayload])
        .select()
        .single();

      if (!error && data) {
        const record = data as AppRecord;
        return {
          client: {
            ...record,
            client_id: record.id,
          },
          generatedSecret,
        };
      }

      if (error) {
        const match = error.message.match(
          /Could not find the '([^']+)' column of 'apps'/i,
        );
        if (match && match[1] && attemptPayload[match[1]] !== undefined) {
          delete attemptPayload[match[1]];
          continue;
        }
        throw new HTTPException(400, { message: error.message });
      }
    }

    throw new HTTPException(500, { message: "Không thể khởi tạo App trong hệ thống" });
  }

  /**
   * Xóa Ứng dụng khỏi bảng apps
   */
  static async deleteClient(env: Bindings, appId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin(env);
    const { error } = await supabase
      .from("apps")
      .delete()
      .eq("id", appId);

    if (error) {
      throw new HTTPException(500, { message: `Lỗi khi xóa app: ${error.message}` });
    }

    return true;
  }
}
