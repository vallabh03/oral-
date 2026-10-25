// Bundles the operational scripts (migrate, staff provisioning) into plain ESM files for the
// production container, which ships without tsx, TypeScript sources or dev dependencies.
// Native/runtime packages stay external and resolve from the standalone server's node_modules.
import { build } from "esbuild";

await build({
  entryPoints: {
    migrate: "scripts/migrate.ts",
    "create-super-admin": "scripts/create-super-admin.ts",
    "create-staff": "scripts/create-staff.ts",
  },
  outdir: "dist/ops",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  conditions: ["react-server"],
  tsconfig: "tsconfig.json",
  external: ["pg", "@node-rs/argon2", "sharp", "@electric-sql/pglite", "@aws-sdk/*"],
  // ESM output still needs require() for any CommonJS dependency that gets bundled.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
