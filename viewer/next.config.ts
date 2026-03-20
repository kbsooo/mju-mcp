import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @a2ui/react ESM 패키지 트랜스파일
  transpilePackages: ["@a2ui/react"],
};

export default nextConfig;
