/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@mozilla/readability', 'jsdom'],
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
