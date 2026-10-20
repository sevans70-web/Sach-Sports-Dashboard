import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {'/api/**':['./model-runtime/*.json','./model-runtime/*.gz']},
};

export default nextConfig;
