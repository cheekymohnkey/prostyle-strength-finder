/** @type {import("next").NextConfig} */
const defaultAllowedDevOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

const envAllowedDevOrigins = String(process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value !== "");

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: Array.from(new Set([
    ...defaultAllowedDevOrigins,
    ...envAllowedDevOrigins,
  ])),
};

module.exports = nextConfig;
