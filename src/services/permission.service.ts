import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types/bindings";
import type {
  CreateRoleInput,
  PermissionMatrixResponse,
  ResourceAction,
  ResourceDef,
  RoleDef,
} from "../types/permissions";
import { getSupabaseAdmin, isSupabaseConfigured } from "../utils/supabase";

// 1. Danh mục Actions chuẩn
export const STANDARD_ACTIONS: ResourceAction[] = [
  { key: "create", label: "Tạo mới", scope: "none" },
  { key: "read:self", label: "Xem của mình", scope: "self" },
  { key: "read:all", label: "Xem tất cả", scope: "all" },
  { key: "update:self", label: "Sửa của mình", scope: "self" },
  { key: "update:all", label: "Sửa tất cả", scope: "all" },
  { key: "delete:self", label: "Xóa của mình", scope: "self" },
  { key: "delete:all", label: "Xóa bất kỳ", scope: "all" },
];

// 2. Danh mục Resources chuẩn
export const STANDARD_RESOURCES: ResourceDef[] = [
  {
    id: "users",
    name: "Tài khoản người dùng",
    description: "Quản lý hồ sơ, tài khoản và danh tính thành viên",
    actions: STANDARD_ACTIONS,
  },
  {
    id: "files",
    name: "Tệp tin & R2 Storage",
    description: "Lưu trữ đám mây, presigned URL upload & download",
    actions: STANDARD_ACTIONS,
  },
  {
    id: "messages",
    name: "Tin nhắn & TeleBot",
    description: "Gửi thông báo, tin nhắn Telegram và quản lý bot",
    actions: [
      { key: "create", label: "Gửi tin / Broadcast", scope: "none" },
      { key: "read:all", label: "Xem lịch sử gửi", scope: "all" },
      { key: "delete:all", label: "Hủy tin / Thu hồi", scope: "all" },
    ],
  },
  {
    id: "clients",
    name: "OAuth 2.0 Clients",
    description: "Đăng ký ứng dụng bên thứ 3 và cấp Client Secret",
    actions: STANDARD_ACTIONS,
  },
  {
    id: "roles",
    name: "Vai trò & Phân quyền IAM",
    description: "Cấu hình Ma trận quyền và gán quyền người dùng",
    actions: [
      { key: "create", label: "Tạo Role mới", scope: "none" },
      { key: "read:all", label: "Xem Ma trận quyền", scope: "all" },
      { key: "update:all", label: "Sửa Ma trận quyền", scope: "all" },
      { key: "delete:all", label: "Xóa Role", scope: "all" },
    ],
  },
];

// 3. Hệ thống Roles mặc định có sẵn (Built-in Roles)
export const DEFAULT_ROLES: RoleDef[] = [
  {
    id: "admin",
    name: "Quản trị viên (Admin)",
    description: "Toàn quyền kiểm soát mọi tài nguyên trên hệ thống",
    is_system: true,
    permissions: [
      "*:*",
      "users:create", "users:read:all", "users:update:all", "users:delete:all",
      "files:create", "files:read:all", "files:update:all", "files:delete:all",
      "messages:create", "messages:read:all", "messages:delete:all",
      "clients:create", "clients:read:all", "clients:update:all", "clients:delete:all",
      "roles:create", "roles:read:all", "roles:update:all", "roles:delete:all",
    ],
  },
  {
    id: "developer",
    name: "Lập trình viên (Developer)",
    description: "Toàn quyền với Storage, TeleBot, OAuth Clients; chỉ sửa profile của mình",
    is_system: true,
    permissions: [
      "users:read:self", "users:update:self",
      "files:create", "files:read:all", "files:update:self", "files:delete:self",
      "messages:create", "messages:read:all",
      "clients:create", "clients:read:all", "clients:update:self", "clients:delete:self",
      "roles:read:all",
    ],
  },
  {
    id: "member",
    name: "Thành viên (Member)",
    description: "Chỉ quản lý tài nguyên của chính mình (Self scope)",
    is_system: true,
    permissions: [
      "users:read:self",
      "users:update:self",
      "files:create",
      "files:read:self",
      "files:delete:self",
    ],
  },
  {
    id: "viewer",
    name: "Người xem (Viewer)",
    description: "Chỉ được xem thông tin công khai hoặc dữ liệu được chỉ định",
    is_system: true,
    permissions: [
      "users:read:self",
      "files:read:all",
      "messages:read:all",
    ],
  },
];

export class PermissionService {
  /**
   * Lấy cấu trúc Ma trận phân quyền đầy đủ cho Admin UI hiển thị bảng Checkbox
   */
  static async getMatrix(env: Bindings): Promise<PermissionMatrixResponse> {
    const roles = await this.listRoles(env);
    return {
      resources: STANDARD_RESOURCES,
      roles,
      allActions: STANDARD_ACTIONS,
    };
  }

  /**
   * Lấy danh sách Roles (kết hợp Built-in và Database Custom Roles)
   */
  static async listRoles(env: Bindings): Promise<RoleDef[]> {
    if (!isSupabaseConfigured(env)) {
      return [...DEFAULT_ROLES];
    }

    const supabase = getSupabaseAdmin(env);
    const customRoles: RoleDef[] = [];

    try {
      const { data: dbRoles, error: rolesErr } = await supabase
        .from("iam_roles")
        .select("id, name, description, is_system");

      if (!rolesErr && dbRoles && dbRoles.length > 0) {
        // Lấy danh sách permissions của từng role
        const { data: dbPerms } = await supabase
          .from("iam_role_permissions")
          .select("role_id, permission");

        const permsByRole = (dbPerms || []).reduce<Record<string, string[]>>((acc, item) => {
          if (!acc[item.role_id]) acc[item.role_id] = [];
          acc[item.role_id].push(item.permission);
          return acc;
        }, {});

        for (const r of dbRoles) {
          customRoles.push({
            id: r.id,
            name: r.name,
            description: r.description || "",
            is_system: Boolean(r.is_system),
            permissions: permsByRole[r.id] || [],
          });
        }
      }
    } catch {
      // Fallback nếu bảng chưa tạo trên Supabase
    }

    // Merge với default roles (ưu tiên custom nếu trùng ID)
    const existingIds = new Set(customRoles.map((r) => r.id));
    const merged = [...customRoles];
    for (const def of DEFAULT_ROLES) {
      if (!existingIds.has(def.id)) {
        merged.push(def);
      }
    }

    return merged;
  }

  /**
   * Tạo hoặc Cập nhật Role với danh sách Permission keys được tích chọn trên Ma trận
   */
  static async createOrUpdateRole(env: Bindings, input: CreateRoleInput & { id?: string }): Promise<RoleDef> {
    const roleId = input.id || input.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseAdmin(env);
      try {
        // 1. Lưu hoặc update Role trong bảng iam_roles
        const { error: roleErr } = await supabase
          .from("iam_roles")
          .upsert({
            id: roleId,
            name: input.name,
            description: input.description || "",
            updated_at: new Date().toISOString(),
          });

        if (roleErr) {
          console.warn("[IAM PermissionService] Upsert role db error:", roleErr.message);
        }

        // 2. Xóa permissions cũ và thêm mới
        await supabase.from("iam_role_permissions").delete().eq("role_id", roleId);

        if (input.permissions && input.permissions.length > 0) {
          const rows = input.permissions.map((p) => ({
            role_id: roleId,
            permission: p,
          }));
          await supabase.from("iam_role_permissions").insert(rows);
        }
      } catch (err: any) {
        console.warn("[IAM PermissionService] Error saving to Supabase:", err.message);
      }
    }

    return {
      id: roleId,
      name: input.name,
      description: input.description || "",
      is_system: false,
      permissions: input.permissions || [],
    };
  }

  /**
   * Xóa một Role (không cho xóa System Roles)
   */
  static async deleteRole(env: Bindings, roleId: string): Promise<boolean> {
    const isSystem = DEFAULT_ROLES.some((r) => r.id === roleId);
    if (isSystem) {
      throw new HTTPException(400, { message: `Không thể xóa Role hệ thống '${roleId}'` });
    }

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseAdmin(env);
      try {
        await supabase.from("iam_role_permissions").delete().eq("role_id", roleId);
        await supabase.from("iam_roles").delete().eq("id", roleId);
        await supabase.from("iam_user_roles").delete().eq("role_id", roleId);
      } catch (err: any) {
        throw new HTTPException(500, { message: `Lỗi xóa role: ${err.message}` });
      }
    }

    return true;
  }

  /**
   * Gán danh sách Roles cho một User
   */
  static async assignUserRoles(env: Bindings, userId: string, roleIds: string[]): Promise<string[]> {
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseAdmin(env);
      try {
        await supabase.from("iam_user_roles").delete().eq("user_id", userId);

        if (roleIds.length > 0) {
          const rows = roleIds.map((rid) => ({
            user_id: userId,
            role_id: rid,
          }));
          await supabase.from("iam_user_roles").insert(rows);
        }
      } catch (err: any) {
        console.warn("[IAM] DB error assigning user roles:", err.message);
      }
    }

    return roleIds;
  }

  /**
   * Lấy tổng hợp toàn bộ quyền hạn (Flattened Permissions) của một User
   */
  static async getUserPermissions(env: Bindings, userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    let assignedRoleIds: string[] = ["member"]; // Default role

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseAdmin(env);
      try {
        const { data, error } = await supabase
          .from("iam_user_roles")
          .select("role_id")
          .eq("user_id", userId);

        if (!error && data && data.length > 0) {
          assignedRoleIds = data.map((d) => d.role_id);
        }
      } catch {
        // Fallback
      }
    }

    const allRoles = await this.listRoles(env);
    const permsSet = new Set<string>();

    for (const rid of assignedRoleIds) {
      const found = allRoles.find((r) => r.id === rid);
      if (found) {
        for (const p of found.permissions) {
          permsSet.add(p);
        }
      }
    }

    return {
      roles: assignedRoleIds,
      permissions: Array.from(permsSet),
    };
  }

  /**
   * Kiểm tra quyền hạn trực tiếp (Deterministic Permission Evaluator):
   * - Hỗ trợ Super Admin wildcard: `*:*` hoặc `users:*`
   * - Hỗ trợ Scope ALL: `users:read:all` hoặc `users:read`
   * - Hỗ trợ Scope SELF: `users:read:self` chỉ khi `resourceOwnerId === currentUserId`
   */
  static checkPermission(
    userPermissions: string[],
    resource: string,
    action: string,
    resourceOwnerId?: string,
    currentUserId?: string,
  ): boolean {
    // 1. Wildcard tối cao
    if (userPermissions.includes("*:*") || userPermissions.includes(`${resource}:*`)) {
      return true;
    }

    // 2. Quyền trên toàn bộ dữ liệu (Scope: ALL)
    if (
      userPermissions.includes(`${resource}:${action}:all`) ||
      userPermissions.includes(`${resource}:${action}`)
    ) {
      return true;
    }

    // 3. Quyền trên dữ liệu của chính mình (Scope: SELF)
    if (userPermissions.includes(`${resource}:${action}:self`)) {
      if (resourceOwnerId && currentUserId && resourceOwnerId === currentUserId) {
        return true;
      }
    }

    return false;
  }
}
