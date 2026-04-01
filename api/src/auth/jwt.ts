import jwt from "jsonwebtoken";
import type { JwtPayload } from "./types.js";
import { CENTRIFUGO_TOKEN_SECRET } from "../config.js";

const EXPIRY = "24h";

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, CENTRIFUGO_TOKEN_SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, CENTRIFUGO_TOKEN_SECRET) as unknown as JwtPayload;
}
