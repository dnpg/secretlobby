import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plugin to stub out server-only modules in client builds
// This is a safety net - prefer using dynamic imports in loaders/actions
function serverOnlyModules(): Plugin {
  const serverOnlyPkgs = [
    "@secretlobby/db",
    "@secretlobby/auth",
    "@secretlobby/payments",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "stripe",
    "bcryptjs",
  ];
  const clientSafeSubpaths = ["@secretlobby/auth/requirements"];
  const VIRTUAL_PREFIX = "\0server-only:";

  return {
    name: "server-only-modules",
    enforce: "pre",
    resolveId(id, _importer, options) {
      // Only stub these out in client (browser) builds, not SSR
      if (options?.ssr === false && serverOnlyPkgs.some(pkg => id === pkg || id.startsWith(pkg + "/")) && !clientSafeSubpaths.includes(id)) {
        return VIRTUAL_PREFIX + id; // Virtual module ID with unique prefix
      }
    },
    load(id) {
      // Return empty stub for virtual server-only modules
      // These should rarely be hit if code properly uses dynamic imports in loaders/actions
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const originalId = id.slice(VIRTUAL_PREFIX.length);
        console.warn(`[server-only-modules] Stubbing ${originalId} - consider using dynamic import in loader/action`);
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
