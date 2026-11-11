import { z } from "zod";

/**
 * Schema validate Request Body của POST /oauth/token
 * Hỗ trợ cả app_id (mới) và client_id (legacy)
 */
export const TokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code", {
    errorMap: () => ({ message: "grant_type phải là 'authorization_code'" }),
  }),
  code: z.string().min(1, "Thiếu authorization code"),
  // Hỗ trợ cả app_id (mới) và client_id (legacy)
  app_id: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  app_secret: z.string().optional(), // mới: app_secret từ bảng apps
  client_secret: z.string().optional(), // legacy
  code_verifier: z.string().optional(),
  redirect_uri: z.string().url("redirect_uri không hợp lệ"),
}).refine(
  (data) => data.app_id || data.client_id,
  { message: "Cần cung cấp app_id hoặc client_id" }
);

export type TokenRequestInput = z.infer<typeof TokenRequestSchema>;

/**
 * Schema validate Đăng ký OAuth Client mới
 */
export const CreateClientSchema = z.object({
  name: z.string().min(2, "Tên ứng dụng tối thiểu 2 ký tự").max(100),
  redirect_uris: z.array(z.string().url("Redirect URI không hợp lệ")).min(1, "Cần ít nhất 1 Redirect URI"),
  is_confidential: z.boolean().default(false),
  description: z.string().max(500).optional(),
  logo_url: z.string().url("Logo URL không hợp lệ").optional(),
});

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
