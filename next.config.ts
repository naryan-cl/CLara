import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — CLara Listens uploads short audio recordings, which
      // need more room. Stays under Vercel's ~4.5MB platform request cap.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
