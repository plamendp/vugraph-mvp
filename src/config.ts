export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://vugraph:vugraph@localhost:5432/vugraph";
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? "operator-secret";
export const WS_GATEWAY_CALLBACK_URL = process.env.WS_GATEWAY_CALLBACK_URL ?? "http://localhost:4000";
export const LOCAL_DEV = process.env.LOCAL_DEV === "true";
