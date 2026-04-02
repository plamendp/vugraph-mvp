import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "/spectator/",
  resolve: {
    alias: {
      "@vugraph/ui": resolve(__dirname, "../../packages/ui/src"),
    },
  },
  server: {
    port: 5002,
    host: "0.0.0.0",
  },
});
