import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../types/bindings";
import { CreateClientSchema } from "../schemas/oauth.schema";
import { ClientService } from "../services/client.service";

export const clientsRoutes = new Hono<AppEnv>();

/**
 * GET /api/clients (hoặc /api/apps): Danh sách các apps đã đăng ký
 */
clientsRoutes.get("/", async (c) => {
  const apps = await ClientService.listClients(c.env);
  return c.json({
    success: true,
    data: apps,
  });
});

/**
 * GET /api/clients/:id: Lấy thông tin chi tiết một app theo id
 */
clientsRoutes.get("/:id", async (c) => {
  const appId = c.req.param("id");
  const app = await ClientService.getClient(c.env, appId);
  if (!app) {
    return c.json(
      {
        success: false,
        error: `Không tìm thấy ứng dụng với ID '${appId}'`,
      },
      404,
    );
  }

  return c.json({
    success: true,
    data: app,
  });
});

/**
 * POST /api/clients (hoặc /api/apps): Đăng ký App mới
 */
clientsRoutes.post(
  "/",
  zValidator("json", CreateClientSchema),
  async (c) => {
    const validatedData = c.req.valid("json");
    const result = await ClientService.createClient(c.env, validatedData);

    return c.json(
      {
        success: true,
        data: result.client,
        generatedSecret: result.generatedSecret,
      },
      201,
    );
  },
);

/**
 * DELETE /api/clients/:id (hoặc /api/apps/:id): Xóa app
 */
clientsRoutes.delete("/:id", async (c) => {
  const appId = c.req.param("id");
  await ClientService.deleteClient(c.env, appId);

  return c.json({
    success: true,
    message: `Đã xóa ứng dụng ${appId}`,
  });
});
