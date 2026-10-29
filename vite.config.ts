import { defineConfig } from "vite";

// The Node entrypoint serves the real API and mounts Vite as frontend middleware.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: [".e2b.app", "localhost"],
  },
});
