/** @type {import("next").NextConfig} */
const path = require("path");

const queryCoreDir = path.dirname(require.resolve("@tanstack/query-core/package.json"));
const reactQueryDir = path.dirname(require.resolve("@tanstack/react-query/package.json"));

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@tanstack/query-core$": path.join(queryCoreDir, "build/legacy/index.js"),
      "@tanstack/react-query$": path.join(reactQueryDir, "build/legacy/index.js"),
    };
    return config;
  },
};

module.exports = nextConfig;
