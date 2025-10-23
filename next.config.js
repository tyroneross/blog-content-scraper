/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@mozilla/readability', 'jsdom'],
}

module.exports = nextConfig
