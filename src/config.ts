export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const DB_PATH = process.env.DB_PATH ?? "./data/vugraph.db";
export const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? "operator-secret";
