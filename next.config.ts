import type { NextConfig } from "next";

// Security headers applied to every response. We scope the CSP to frame-ancestors
// only (clickjacking defense) rather than a full script/style policy, which would
// require nonces to avoid breaking Next's inline runtime — frame-ancestors covers
// the login-page clickjacking risk without that complexity.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server (with a minimal node_modules)
  // so the Docker runtime image stays small and doesn't need a full install.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
