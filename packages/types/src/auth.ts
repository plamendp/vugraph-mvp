export type RoleName = "admin" | "operator" | "spectator" | "commentator";

export const ALL_ROLES: RoleName[] = ["admin", "operator", "spectator", "commentator"];

export interface UserInfo {
  id: number;
  username: string;
  roles: RoleName[];
}
