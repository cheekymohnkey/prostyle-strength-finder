const fs = require("fs");
const path = require("path");

function isDebugEnabled() {
  return (process.env.OPENAI_DEBUG_LOGGING || "").trim().toLowerCase() === "true";
}

function resolveLogPath() {
  const configured = (process.env.OPENAI_DEBUG_LOG_PATH || "").trim();
  return configured || path.resolve(process.cwd(), "data", "logs", "openai-debug.jsonl");
}

function maxBodyChars() {
  const parsed = Number.parseInt(process.env.OPENAI_DEBUG_MAX_BODY_CHARS || "200000", 10);
  if (!Number.isInteger(parsed) || parsed < 1000) {
    return 200000;
  }
  return parsed;
}

function truncateString(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const limit = maxBodyChars();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`;
}

function ensureLogDir(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

function appendOpenAiDebugEvent(event) {
  if (!isDebugEnabled()) {
    return;
  }
  const logPath = resolveLogPath();
  ensureLogDir(logPath);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event,
  });
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
}

function createOpenAiDebugSession(input) {
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const base = {
    sessionId,
    adapter: input.adapter,
    operation: input.operation,
    model: input.model || null,
    url: input.url || null,
  };
  return {
    sessionId,
    logRequest(requestBody) {
      appendOpenAiDebugEvent({
        ...base,
        phase: "request",
        requestBodyRaw: truncateString(requestBody),
      });
    },
    logResponse(response) {
      appendOpenAiDebugEvent({
        ...base,
        phase: "response",
        status: Number(response.status || 0),
        responseBodyRaw: truncateString(response.bodyRaw || ""),
      });
    },
    logError(error) {
      appendOpenAiDebugEvent({
        ...base,
        phase: "error",
        errorMessage: String(error?.message || error || "unknown error"),
      });
    },
  };
}

function readRecentOpenAiDebugEvents(limit = 100) {
  const logPath = resolveLogPath();
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const text = fs.readFileSync(logPath, "utf8");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const selected = lines.slice(-Math.max(1, Math.min(Number(limit) || 100, 500)));
  return selected.reverse().map((line) => {
    try {
      return JSON.parse(line);
    } catch (_error) {
      return {
        timestamp: new Date().toISOString(),
        phase: "parse_error",
        line,
      };
    }
  });
}

function clearOpenAiDebugEvents() {
  const logPath = resolveLogPath();
  ensureLogDir(logPath);
  fs.writeFileSync(logPath, "", "utf8");
}

module.exports = {
  isDebugEnabled,
  resolveLogPath,
  createOpenAiDebugSession,
  readRecentOpenAiDebugEvents,
  clearOpenAiDebugEvents,
};
