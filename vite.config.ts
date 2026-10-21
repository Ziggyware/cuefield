import { defineConfig } from "vite";
import { mockApi } from "./dev/mock-api.ts";

/**
 * Local development only. Production is the Val Town app in main.tsx, which serves the frontend and the real
 * backend; this config runs the same frontend against a small mock of the HTTP API so the table, the HUD and the
 * solo modes can be exercised without the server runtime.
 */
export default defineConfig({
  plugins: [mockApi()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: [".e2b.app", "localhost"],
  },
});
