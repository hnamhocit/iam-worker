import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Bindings } from "../types/bindings";

/**
 * Kiểm tra xem môi trường đã được cấp Supabase Key hợp lệ chưa
 */
export function isSupabaseConfigured(env: Bindings): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      (env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

/**
 * Khởi tạo Supabase Admin Client scoped theo request environment bindings.
 * Sử dụng fallback key nếu chưa có secret để tránh throw exception lúc khởi tạo.
 */
export function getSupabaseAdmin(env: Bindings): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "https://stbswcnsitztbusqrdhi.supabase.co";
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "anon-placeholder-key-for-worker-initialization";

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
