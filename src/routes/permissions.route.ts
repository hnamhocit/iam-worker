import { Hono } from "hono";
import type { AppEnv } from "../types/bindings";
import { PermissionService } from "../services/permission.service";

export const permissionsRoutes = new Hono<AppEnv>();

/**
 * GET /api/iam/matrix: Lấy toàn bộ Ma trận phân quyền (Resources, Actions, Roles)
 * Dùng cho Admin Dashboard hiển thị bảng Checkbox trực quan
 */
permissionsRoutes.get("/matrix", async (c) => {
  const matrix = await PermissionService.getMatrix(c.env);
  return c.json({
    ok: true,
    data: matrix,
  });
});

/**
 * GET /api/iam/roles: Danh sách các Roles và danh sách Permissions của từng Role
 */
permissionsRoutes.get("/roles", async (c) => {
  const roles = await PermissionService.listRoles(c.env);
  return c.json({
    ok: true,
    data: roles,
  });
});

/**
 * POST /api/iam/roles: Tạo mới hoặc cập nhật Role từ các ô tích chọn trên Ma trận
 */
permissionsRoutes.post("/roles", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.name || !Array.isArray(body.permissions)) {
    return c.json(
      {
        ok: false,
        error: "Yêu cầu phải có 'name' (chuỗi) và 'permissions' (mảng chuỗi quyền)",
      },
      400,
    );
  }

  const role = await PermissionService.createOrUpdateRole(c.env, {
    id: body.id,
    name: body.name,
    description: body.description,
    permissions: body.permissions,
  });

  return c.json(
    {
      ok: true,
      message: `Đã lưu Role '${role.name}' thành công`,
      data: role,
    },
    201,
  );
});

/**
 * DELETE /api/iam/roles/:id: Xóa Role
 */
permissionsRoutes.delete("/roles/:id", async (c) => {
  const roleId = c.req.param("id");
  await PermissionService.deleteRole(c.env, roleId);
  return c.json({
    ok: true,
    message: `Đã xóa Role '${roleId}'`,
  });
});

/**
 * GET /api/iam/users/:userId/permissions: Lấy Roles và danh sách quyền tổng hợp của một User
 */
permissionsRoutes.get("/users/:userId/permissions", async (c) => {
  const userId = c.req.param("userId");
  const result = await PermissionService.getUserPermissions(c.env, userId);
  return c.json({
    ok: true,
    data: {
      userId,
      roles: result.roles,
      permissions: result.permissions,
    },
  });
});

/**
 * POST /api/iam/users/:userId/roles: Gán danh sách Roles cho một User
 */
permissionsRoutes.post("/users/:userId/roles", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.roleIds)) {
    return c.json(
      {
        ok: false,
        error: "Yêu cầu mảng 'roleIds' (ví dụ: ['admin'] hoặc ['member', 'developer'])",
      },
      400,
    );
  }

  const assigned = await PermissionService.assignUserRoles(c.env, userId, body.roleIds);
  return c.json({
    ok: true,
    message: `Đã cập nhật vai trò cho người dùng '${userId}'`,
    data: {
      userId,
      roles: assigned,
    },
  });
});

/**
 * POST /api/iam/evaluate: Kiểm tra nhanh quyền hạn của User với Resource & Action cụ thể
 */
permissionsRoutes.post("/evaluate", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.userId || !body.resource || !body.action) {
    return c.json(
      {
        ok: false,
        error: "Yêu cầu đầy đủ: userId, resource, action (tùy chọn: resourceOwnerId)",
      },
      400,
    );
  }

  const userPerms = await PermissionService.getUserPermissions(c.env, body.userId);
  const allowed = PermissionService.checkPermission(
    userPerms.permissions,
    body.resource,
    body.action,
    body.resourceOwnerId,
    body.userId,
  );

  return c.json({
    ok: true,
    allowed,
    userId: body.userId,
    resource: body.resource,
    action: body.action,
    reason: allowed ? "Được phép truy cập" : "Từ chối: Không đủ quyền hạn",
  });
});
