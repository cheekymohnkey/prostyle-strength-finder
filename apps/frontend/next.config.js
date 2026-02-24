/** @type {import("next").NextConfig} */
function normalizeDevOrigin(value) {
  const input = String(value || "").trim();
  if (input === "") {
    return "";
  }
  if (input.startsWith("*.")) {
    return input;
  }
  try {
    return new URL(input).hostname || "";
  } catch (_error) {
    return input.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].trim();
  }
}

const defaultAllowedDevOrigins = [
  "127.0.0.1",
  "localhost",
];

const envAllowedDevOrigins = String(process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((value) => normalizeDevOrigin(value))
  .filter((value) => value !== "");

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: Array.from(new Set([
    ...defaultAllowedDevOrigins,
    ...envAllowedDevOrigins,
  ])),
};

module.exports = nextConfig;
