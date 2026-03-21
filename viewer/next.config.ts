import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESM 패키지 트랜스파일
  transpilePackages: ["@a2ui/react", "@a2ui/lit", "@a2ui/web_core"],
  // Lit 관련 패키지는 브라우저 전용 → 서버 번들 제외
  serverExternalPackages: ["lit", "@lit/context", "@lit-labs/signals", "signal-utils"],
};

export default nextConfig;
