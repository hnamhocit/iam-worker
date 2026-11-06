/**
 * Types & Schema cho hệ thống Ma trận phân quyền (Role-Permission Matrix)
 */

export interface ResourceAction {
  key: string; // e.g. "read:self", "read:all", "create"
  label: string; // e.g. "Xem của mình", "Xem tất cả", "Tạo mới"
  scope: "self" | "all" | "none";
}

export interface ResourceDef {
  id: string; // e.g. "users", "files", "messages", "clients", "roles"
  name: string; // e.g. "Tài khoản người dùng"
  description: string;
  actions: ResourceAction[];
}

export interface RoleDef {
  id: string;
  name: string;
  description: string;
  is_system?: boolean;
  permissions: string[]; // Danh sách chuỗi quyền, e.g. ["users:read:self", "files:create", "*:*"]
}

export interface PermissionMatrixResponse {
  resources: ResourceDef[];
  roles: RoleDef[];
  allActions: ResourceAction[];
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface AssignUserRoleInput {
  userId: string;
  roleIds: string[];
}
