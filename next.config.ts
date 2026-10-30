import type { NextConfig } from "next";

// Static security headers. The Content-Security-Policy (with a per-request nonce)
// is set in src/proxy.ts because it must change on every response.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Camera is allowed for this origin only (participant photo capture); everything else is off.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // The container build (Dockerfile) sets NEXT_OUTPUT=standalone; local `next start` stays as is.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "@node-rs/argon2", "pg"],
  // Cap build workers: each prerendered share image instantiates its own WebAssembly renderer,
  // which exhausts memory on smaller build machines when many workers run at once.
  experimental: { cpus: 2 },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920, 2560],
    imageSizes: [64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
