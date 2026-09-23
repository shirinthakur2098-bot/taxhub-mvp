/** @type {import('next').NextConfig} */
const nextConfig = {
  // The knowledge base is read from disk at runtime. On Vercel, API routes run as
  // serverless functions, so the /knowledge folder must be bundled explicitly.
  outputFileTracingIncludes: {
    "/api/**/*": ["./knowledge/**/*"],
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
