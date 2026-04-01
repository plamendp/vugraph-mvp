export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://vugraph:vugraph@localhost:5432/vugraph";
export const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? "operator-secret";
export const CENTRIFUGO_API_URL = process.env.CENTRIFUGO_API_URL ?? "http://localhost:8000/api";
export const CENTRIFUGO_API_KEY = process.env.CENTRIFUGO_API_KEY ?? "centrifugo-api-key";
export const CENTRIFUGO_TOKEN_SECRET = process.env.CENTRIFUGO_TOKEN_SECRET ?? "centrifugo-token-secret";
