import type { NextConfig } from "next";

const nextConfig: NextConfig = {
async rewrites() {
  return [
    {
      source: "/backend-api/:path*",
      destination: "http://localhost:5050/:path*",
    },
  ];
},
};

export default nextConfig;