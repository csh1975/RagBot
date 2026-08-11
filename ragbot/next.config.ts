import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Vercel 서버리스 함수 타임아웃 설정 (최대 60초, Pro 플랜은 300초)
  // 필요시 vercel.json에서 별도 설정
};

export default nextConfig;