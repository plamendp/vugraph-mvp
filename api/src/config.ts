export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const LOCAL_DEV = process.env.LOCAL_DEV === "true";
export const DATABASE_URL = requireEnv("DATABASE_URL");
export const CENTRIFUGO_API_URL = process.env.CENTRIFUGO_API_URL ?? "http://localhost:8000/api";
export const CENTRIFUGO_API_KEY = requireEnv("CENTRIFUGO_API_KEY");
export const CENTRIFUGO_TOKEN_SECRET = requireEnv("CENTRIFUGO_TOKEN_SECRET");

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}
