import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {'/api/**':['./model-runtime/*.json','./model-runtime/*.gz','./data/mlb*performance_history.json']},
};

export default nextConfig;
