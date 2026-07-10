/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/admin/import-schools': ['./data/territory-schools.csv'],
  },
};
export default nextConfig;
