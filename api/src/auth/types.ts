// Single source of truth: @vugraph/types
import type { RoleName } from "../../../packages/types/src/auth.js";
export { type RoleName, ALL_ROLES } from "../../../packages/types/src/auth.js";

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
