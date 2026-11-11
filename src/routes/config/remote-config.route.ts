import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { AppEnv } from "../../types/bindings";

const configRoutes = new Hono<AppEnv>();

configRoutes.get("/:app_id", async (c) => {
  const appId = c.req.param("app_id");
  const supabase = createClient(
    c.env.NEXT_PUBLIC_SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Kiểm tra app
  const { data: app, error: appError } = await supabase
    .from("apps")
    .select("id")
    .eq("id", appId)
    .eq("status", "active")
    .single();

  if (appError || !app) {
    return c.json({ error: "App not found or inactive" }, 404);
  }

  // 2. Lấy config
  const { data: record, error: configError } = await supabase
    .from("app_remote_configs")
    .select("is_enabled, config")
    .eq("app_id", appId)
    .single();

  c.header("Cache-Control", "public, max-age=60, s-maxage=300");

  if (configError || !record || !record.is_enabled) {
    return c.json({ enabled: false, config: {} });
  }

  return c.json({ enabled: true, config: record.config });
});

export { configRoutes };
