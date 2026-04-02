export type RoleName = "admin" | "operator" | "spectator" | "commentator";

export interface UserInfo {
  id: number;
  username: string;
  roles: RoleName[];
}
