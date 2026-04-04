import jwt from "jsonwebtoken";
import type { JwtPayload } from "./types.js";
import { CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY } from "../config.js";

const EXPIRY = "24h";

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY) as unknown as JwtPayload;
}
