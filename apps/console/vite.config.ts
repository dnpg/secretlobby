import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plugin to stub out server-only modules in client builds
function serverOnlyModules(): Plugin {
  const serverOnlyPkgs = ["@secretlobby/db", "@secretlobby/auth", "@prisma/client", "@prisma/adapter-pg", "pg"];

  return {
    name: "server-only-modules",
    enforce: "pre",
    resolveId(id, importer, options) {
      // Only stub these out in client (browser) builds, not SSR
      if (options?.ssr === false && serverOnlyPkgs.some(pkg => id === pkg || id.startsWith(pkg + "/"))) {
        return "\0" + id; // Virtual module ID
      }
    },
    load(id) {
      // Return empty stub for virtual server-only modules
      if (id.startsWith("\0@secretlobby/db") || id.startsWith("\0@secretlobby/auth") || id.startsWith("\0@prisma") || id.startsWith("\0pg")) {
        return "export default {};";
      }
    },
  };
}

export default defineConfig({
  envDir: "../../",
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), serverOnlyModules()],
  ssr: {
    noExternal: ["@secretlobby/ui"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: [
      "secretlobby.local",
      "www.secretlobby.local",
      "app.secretlobby.local",
      "admin.secretlobby.local",
      ".secretlobby.local", // Allow all subdomains
    ],
  },
});
