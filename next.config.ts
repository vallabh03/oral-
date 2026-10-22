import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/workspace/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            // 2 years; includeSubDomains; preload-ready
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            // CSP — hardened:
            //   script-src: 'unsafe-inline' removed. Next.js inline scripts
            //   should be migrated to nonce-based injection via middleware.
            //   Until middleware nonces are wired up, 'self' scripts only.
            //   style-src: 'unsafe-inline' kept for Tailwind CSS; move to
            //   nonces when you migrate off runtime CSS-in-JS.
            //
            // To add nonce support for Next.js inline scripts, create
            // middleware.ts that generates a per-request nonce and sets it
            // on the x-nonce response header, then reference it in layout.tsx.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
