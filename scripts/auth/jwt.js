const crypto = require("crypto");

const jwksCache = new Map();

function decodeBase64UrlJson(value, label) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (_error) {
    throw new Error(`Invalid ${label} segment`);
  }
}

function parseBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error("JWT must have 3 segments");
  }

  const [headerB64, payloadB64, signatureB64] = segments;
  const header = decodeBase64UrlJson(headerB64, "JWT header");
  const payload = decodeBase64UrlJson(payloadB64, "JWT payload");

  return {
    token,
    signingInput: `${headerB64}.${payloadB64}`,
    signature: signatureB64,
    header,
    payload,
  };
}

function audienceMatches(payload, expectedAudience) {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    return aud.includes(expectedAudience);
  }
  if (typeof aud === "string") {
    return aud === expectedAudience;
  }
  if (typeof payload.client_id === "string") {
    return payload.client_id === expectedAudience;
  }
  return false;
}

function validateStandardClaims(payload, config) {
  if (payload.iss !== config.auth.issuer) {
    throw new Error("JWT issuer mismatch");
  }

  if (!audienceMatches(payload, config.auth.audience)) {
    throw new Error("JWT audience mismatch");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= now) {
    throw new Error("JWT is expired");
  }

  if (typeof payload.nbf === "number" && payload.nbf > now) {
    throw new Error("JWT not valid yet");
  }
}

async function fetchJwks(config) {
  const ttlSec = config.auth.jwksCacheTtlSec;
  const cacheKey = config.auth.issuer;
  const existing = jwksCache.get(cacheKey);
  const nowMs = Date.now();
  if (existing && existing.expiresAtMs > nowMs) {
    return existing.jwks;
  }

  const jwksUrl = `${config.auth.issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch JWKS (${response.status})`);
  }

  const jwks = await response.json();
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error("Invalid JWKS payload");
  }

  jwksCache.set(cacheKey, {
    jwks,
    expiresAtMs: nowMs + ttlSec * 1000,
  });
  return jwks;
}

function verifySignature(signingInput, signatureB64, jwk) {
  const key = crypto.createPublicKey({
    key: jwk,
    format: "jwk",
  });
  const signature = Buffer.from(signatureB64, "base64url");
  return crypto.verify("RSA-SHA256", Buffer.from(signingInput, "utf8"), key, signature);
}

async function verifyJwt(authHeader, config) {
  const parsed = parseBearerToken(authHeader);

  if (config.auth.jwtVerificationMode === "insecure") {
    validateStandardClaims(parsed.payload, config);
    return parsed.payload;
  }

  if (parsed.header.alg !== "RS256") {
    throw new Error(`Unsupported JWT alg: ${parsed.header.alg}`);
  }
  if (!parsed.header.kid) {
    throw new Error("JWT missing kid");
  }

  const jwks = await fetchJwks(config);
  const jwk = jwks.keys.find((item) => item.kid === parsed.header.kid);
  if (!jwk) {
    throw new Error("JWT kid not found in JWKS");
  }

  const signatureValid = verifySignature(parsed.signingInput, parsed.signature, jwk);
  if (!signatureValid) {
    throw new Error("JWT signature verification failed");
  }

  validateStandardClaims(parsed.payload, config);
  return parsed.payload;
}

module.exports = {
  verifyJwt,
};
