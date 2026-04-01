export type RoleName = "admin" | "operator" | "spectator" | "commentator";

export const ALL_ROLES: RoleName[] = ["admin", "operator", "spectator", "commentator"];

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
  roles: RoleName[];
  iat?: number;
  exp?: number;
}
