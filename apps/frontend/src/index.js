const http = require("http");
const { loadFrontendConfig } = require("./config");
const { extractMidjourneyFieldsFromPngBuffer } = require("../../../scripts/ingestion/png-metadata");

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function htmlPage(config) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prostyle Recommendation Flow</title>
  <style>
    :root {
      --bg: #f7f9fc;
      --surface: #ffffff;
      --ink: #17212f;
      --muted: #5f6f84;
      --line: #d7dfeb;
      --primary: #005f73;
      --primary-strong: #0a9396;
      --warn: #9b2226;
      --ok: #2a9d8f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Avenir Next", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -20%, #d7eff6 0%, transparent 70%),
        radial-gradient(900px 500px at 100% 0%, #ffe8d6 0%, transparent 65%),
        var(--bg);
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .hero { margin-bottom: 18px; }
    .hero h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
    .hero p { margin: 8px 0 0; color: var(--muted); }
    .grid { display: grid; gap: 16px; }
    @media (min-width: 900px) {
      .grid { grid-template-columns: 1fr 1fr; align-items: start; }
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 8px 24px rgba(20, 40, 70, 0.06);
    }
    .card h2 {
      margin: 0 0 10px;
      font-size: 17px;
    }
    .row { display: grid; gap: 8px; margin-bottom: 10px; }
    label { font-size: 12px; color: var(--muted); }
    input, select, textarea, button {
      font: inherit;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px 10px;
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 72px; resize: vertical; }
    button {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 9px 12px;
      cursor: pointer;
      background: var(--primary);
      color: #fff;
      transition: background 120ms ease;
    }
    button:hover { background: var(--primary-strong); }
    button.secondary {
      background: #fff;
      color: var(--ink);
      border-color: var(--line);
    }
    button.secondary:hover { background: #f4f7fb; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .meta {
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fbfdff;
      font-size: 13px;
    }
    .status { font-size: 13px; color: var(--muted); }
    .status.error { color: var(--warn); }
    .status.ok { color: var(--ok); }
    .result-list { display: grid; gap: 10px; margin-top: 10px; }
    .rec {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }
    .rec-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      background: #f6f9fc;
    }
    .badge.warn {
      background: #fff3f3;
      border-color: #f3c3c4;
      color: #8f1f24;
    }
    ul {
      margin: 6px 0 0 18px;
      padding: 0;
    }
    code.inline {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      background: #eef3f8;
      border-radius: 6px;
      padding: 2px 6px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>Recommendation + Feedback Flow (MVP-1/2)</h1>
      <p>Extraction review -> confirm -> ranked results -> optional post-result feedback. Frontend proxies API calls to avoid CORS issues.</p>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h2>Connection</h2>
      <div class="row">
        <label for="authToken">Bearer token</label>
        <input id="authToken" placeholder="Paste JWT bearer token" />
      </div>
      <div class="actions">
        <button id="btnToken" class="secondary" type="button">Generate Local Token</button>
        <span class="status">APP_ENV: <code class="inline">${config.appEnv}</code> | API: <code class="inline">${config.apiBaseUrl}</code></span>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <h2>1) Create Extraction</h2>
        <div class="row">
          <label for="pngFile">MidJourney PNG (required)</label>
          <input id="pngFile" type="file" accept="image/png" />
        </div>
        <p class="status">The frontend parses PNG metadata and sends normalized fields to the API extraction endpoint.</p>
        <div class="actions">
          <button id="btnExtract" type="button">Create Extraction</button>
        </div>
        <p id="extractStatus" class="status"></p>
        <div id="extractionMeta" class="meta" hidden></div>
      </section>

      <section class="card">
        <h2>2) Confirm + Retrieve Session</h2>
        <div class="row">
          <label for="mode">Mode</label>
          <select id="mode">
            <option value="precision">precision</option>
            <option value="close_enough">close_enough</option>
          </select>
        </div>
        <div class="actions">
          <button id="btnConfirm" type="button" disabled>Confirm Extraction</button>
          <button id="btnFetchSession" type="button" class="secondary" disabled>Fetch Session</button>
        </div>
        <p id="confirmStatus" class="status"></p>
      </section>
    </div>

    <section class="card" style="margin-top:16px;">
      <h2>3) Session Results</h2>
      <div id="sessionMeta" class="meta" hidden></div>
      <div id="results" class="result-list"></div>
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>4) Post-Result Feedback</h2>
      <div class="row">
        <label for="feedbackRecommendation">Recommendation</label>
        <select id="feedbackRecommendation"></select>
      </div>
      <div class="row">
        <label for="generatedImageFile">Generated Image (optional)</label>
        <input id="generatedImageFile" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
      <div class="row">
        <label for="emojiRating">Emoji Rating (optional)</label>
        <select id="emojiRating">
          <option value="">(none)</option>
          <option value="🙂">🙂</option>
          <option value="☹️">☹️</option>
        </select>
      </div>
      <div class="row">
        <label for="usefulFlag">Useful? (optional)</label>
        <select id="usefulFlag">
          <option value="">(none)</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
      <div class="row">
        <label for="feedbackComments">Comments (optional)</label>
        <textarea id="feedbackComments" placeholder="What matched or missed?"></textarea>
      </div>
      <div class="actions">
        <button id="btnSubmitFeedback" type="button" disabled>Submit Feedback</button>
        <button id="btnFetchFeedback" type="button" class="secondary" disabled>Fetch Feedback</button>
      </div>
      <p id="feedbackStatus" class="status"></p>
      <div id="feedbackMeta" class="meta" hidden></div>
      <div id="feedbackList" class="result-list"></div>
    </section>
  </div>

  <script>
    const state = {
      extractionId: null,
      sessionId: null,
      recommendationIds: [],
    };

    const authTokenEl = document.getElementById("authToken");
    const extractStatusEl = document.getElementById("extractStatus");
    const confirmStatusEl = document.getElementById("confirmStatus");
    const extractionMetaEl = document.getElementById("extractionMeta");
    const sessionMetaEl = document.getElementById("sessionMeta");
    const resultsEl = document.getElementById("results");
    const confirmBtn = document.getElementById("btnConfirm");
    const fetchSessionBtn = document.getElementById("btnFetchSession");
    const submitFeedbackBtn = document.getElementById("btnSubmitFeedback");
    const fetchFeedbackBtn = document.getElementById("btnFetchFeedback");
    const feedbackStatusEl = document.getElementById("feedbackStatus");
    const feedbackMetaEl = document.getElementById("feedbackMeta");
    const feedbackListEl = document.getElementById("feedbackList");

    function setStatus(el, message, tone) {
      el.textContent = message || "";
      el.className = "status" + (tone ? " " + tone : "");
    }

    function generateLocalToken() {
      const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      const payload = btoa(JSON.stringify({
        iss: "${process.env.COGNITO_ISSUER || ""}",
        aud: "${process.env.COGNITO_AUDIENCE || ""}",
        sub: "frontend-local-user",
        exp: Math.floor(Date.now() / 1000) + 3600
      })).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      authTokenEl.value = header + "." + payload + ".sig";
    }

    async function apiRequest(path, options) {
      const token = authTokenEl.value.trim();
      if (!token) {
        throw new Error("Bearer token is required");
      }

      const response = await fetch(path, {
        ...options,
        headers: {
          "content-type": "application/json",
          "x-auth-token": token,
          ...(options && options.headers ? options.headers : {}),
        },
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = json && json.error ? (json.error.message + (json.error.details && json.error.details.reason ? ": " + json.error.details.reason : "")) : ("HTTP " + response.status);
        throw new Error(reason);
      }
      return json;
    }

    function readFileAsBase64(file, contextLabel) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = String(reader.result || "");
          const marker = ";base64,";
          const idx = value.indexOf(marker);
          if (idx < 0) {
            reject(new Error("Failed to encode " + contextLabel + " as base64 payload"));
            return;
          }
          resolve(value.slice(idx + marker.length));
        };
        reader.onerror = () => {
          reject(new Error("Failed reading " + contextLabel + " file"));
        };
        reader.readAsDataURL(file);
      });
    }

    function renderExtraction(extraction) {
      extractionMetaEl.hidden = false;
      extractionMetaEl.innerHTML =
        "<div><strong>Extraction:</strong> " + extraction.extractionId + "</div>" +
        "<div><strong>Status:</strong> " + extraction.status + "</div>" +
        "<div><strong>Prompt:</strong> " + extraction.prompt + "</div>" +
        "<div><strong>Model:</strong> " + extraction.modelFamily + " " + extraction.modelVersion + "</div>" +
        "<div><strong>Flags:</strong> baseline=" + extraction.isBaseline + ", profile=" + extraction.hasProfile + ", sref=" + extraction.hasSref + "</div>";
    }

    function renderSession(session) {
      sessionMetaEl.hidden = false;
      sessionMetaEl.innerHTML =
        "<div><strong>Session:</strong> " + session.sessionId + "</div>" +
        "<div><strong>Status:</strong> " + session.status + "</div>" +
        "<div><strong>Mode:</strong> " + session.mode + "</div>" +
        "<div><strong>Prompt:</strong> " + (session.prompt ? session.prompt.promptText : "n/a") + "</div>";

      resultsEl.innerHTML = "";
      const recommendations = Array.isArray(session.recommendations) ? session.recommendations : [];
      state.recommendationIds = recommendations.map((rec) => rec.recommendationId).filter(Boolean);
      const feedbackRecommendationEl = document.getElementById("feedbackRecommendation");
      feedbackRecommendationEl.innerHTML = "";
      for (const rec of recommendations) {
        const option = document.createElement("option");
        option.value = rec.recommendationId;
        option.textContent = "#" + rec.rank + " - " + rec.combinationId + " (" + rec.recommendationId + ")";
        feedbackRecommendationEl.appendChild(option);
      }
      submitFeedbackBtn.disabled = recommendations.length === 0;
      fetchFeedbackBtn.disabled = recommendations.length === 0;

      if (recommendations.length === 0) {
        const empty = document.createElement("div");
        empty.className = "status";
        empty.textContent = "No recommendations available for this session yet.";
        resultsEl.appendChild(empty);
        return;
      }

      for (const rec of recommendations) {
        const card = document.createElement("article");
        card.className = "rec";
        const low = rec.lowConfidence && rec.lowConfidence.isLowConfidence === true;
        const riskList = Array.isArray(rec.riskNotes) ? rec.riskNotes : [];
        const improveList = Array.isArray(rec.promptImprovements) ? rec.promptImprovements : [];
        card.innerHTML = \`
          <div class="rec-head">
            <strong>#\${rec.rank} - \${rec.combinationId}</strong>
            <span class="badge \${low ? "warn" : ""}">confidence \${rec.confidence}\${low ? " (low-confidence)" : ""}</span>
          </div>
          <div><strong>Rationale:</strong> \${rec.rationale}</div>
          <div style="margin-top:6px;"><strong>Risk Notes:</strong>\${riskList.length ? "<ul>" + riskList.map((x) => "<li>" + x + "</li>").join("") + "</ul>" : " none"}</div>
          <div style="margin-top:6px;"><strong>Prompt Improvements:</strong>\${improveList.length ? "<ul>" + improveList.map((x) => "<li>" + x + "</li>").join("") + "</ul>" : " none"}</div>
        \`;
        resultsEl.appendChild(card);
      }
    }

    function renderFeedbackCollection(items) {
      feedbackListEl.innerHTML = "";
      const list = Array.isArray(items) ? items : [];
      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "status";
        empty.textContent = "No feedback submitted for this session yet.";
        feedbackListEl.appendChild(empty);
        return;
      }
      for (const item of list) {
        const card = document.createElement("article");
        card.className = "rec";
        const alignment = item.alignment || {};
        const suggestions = Array.isArray(alignment.suggestedPromptAdjustments) ? alignment.suggestedPromptAdjustments : [];
        card.innerHTML = \`
          <div class="rec-head">
            <strong>Feedback \${item.feedbackId}</strong>
            <span class="badge">\${item.evidenceStrength || "minor"}</span>
          </div>
          <div><strong>Emoji:</strong> \${item.emojiRating || "(none)"} | <strong>Useful:</strong> \${item.usefulFlag === null ? "(none)" : item.usefulFlag}</div>
          <div><strong>Comments:</strong> \${item.comments || "(none)"}</div>
          <div style="margin-top:6px;"><strong>Alignment Score:</strong> \${alignment.alignmentScore ?? "n/a"} | <strong>Delta:</strong> \${alignment.confidenceDelta ?? "n/a"}</div>
          <div style="margin-top:6px;"><strong>Mismatch:</strong> \${alignment.mismatchSummary || "n/a"}</div>
          <div style="margin-top:6px;"><strong>Prompt Adjustments:</strong>\${suggestions.length ? "<ul>" + suggestions.map((x) => "<li>" + x + "</li>").join("") + "</ul>" : " none"}</div>
        \`;
        feedbackListEl.appendChild(card);
      }
    }

    async function onCreateExtraction() {
      setStatus(extractStatusEl, "Creating extraction...", "");
      try {
        const fileInput = document.getElementById("pngFile");
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        if (!file) {
          throw new Error("Select a MidJourney PNG file first");
        }
        const fileBase64 = await readFileAsBase64(file, "PNG");
        const payload = {
          fileName: file.name || "upload.png",
          mimeType: file.type || "image/png",
          fileBase64,
        };
        const json = await apiRequest("/api/recommendation-extractions/upload", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        state.extractionId = json.extraction.extractionId;
        state.sessionId = null;
        confirmBtn.disabled = false;
        fetchSessionBtn.disabled = true;
        renderExtraction(json.extraction);
        sessionMetaEl.hidden = true;
        resultsEl.innerHTML = "";
        setStatus(extractStatusEl, "PNG metadata extracted. Review and confirm to continue.", "ok");
      } catch (error) {
        setStatus(extractStatusEl, error.message, "error");
      }
    }

    async function onSubmitFeedback() {
      if (!state.sessionId) {
        setStatus(feedbackStatusEl, "Load a recommendation session first.", "error");
        return;
      }

      setStatus(feedbackStatusEl, "Submitting feedback...", "");
      try {
        const recommendationId = document.getElementById("feedbackRecommendation").value;
        if (!recommendationId) {
          throw new Error("Select a recommendation first");
        }

        const generatedImageInput = document.getElementById("generatedImageFile");
        const generatedImage = generatedImageInput && generatedImageInput.files ? generatedImageInput.files[0] : null;
        let generatedImageId = null;
        if (generatedImage) {
          const imageBase64 = await readFileAsBase64(generatedImage, "generated image");
          const uploadJson = await apiRequest("/api/generated-images", {
            method: "POST",
            body: JSON.stringify({
              recommendationSessionId: state.sessionId,
              fileName: generatedImage.name || "generated.png",
              mimeType: generatedImage.type || "image/png",
              fileBase64: imageBase64,
            }),
          });
          generatedImageId = uploadJson.generatedImage.generatedImageId;
        }

        const emojiRating = document.getElementById("emojiRating").value || null;
        const usefulRaw = document.getElementById("usefulFlag").value;
        const usefulFlag = usefulRaw === "" ? null : usefulRaw === "true";
        const comments = document.getElementById("feedbackComments").value.trim() || null;

        const payload = {
          recommendationSessionId: state.sessionId,
          recommendationId,
          generatedImageId,
          emojiRating,
          usefulFlag,
          comments,
        };

        const json = await apiRequest("/api/post-result-feedback", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        feedbackMetaEl.hidden = false;
        feedbackMetaEl.innerHTML =
          "<div><strong>Feedback:</strong> " + json.feedback.feedbackId + "</div>" +
          "<div><strong>Evidence Strength:</strong> " + json.feedback.evidenceStrength + "</div>" +
          "<div><strong>Alignment:</strong> " + json.alignment.alignmentScore + " (delta " + json.alignment.confidenceDelta + ")</div>";
        setStatus(feedbackStatusEl, "Feedback submitted.", "ok");
        await onFetchFeedback();
      } catch (error) {
        setStatus(feedbackStatusEl, error.message, "error");
      }
    }

    async function onFetchFeedback() {
      if (!state.sessionId) {
        setStatus(feedbackStatusEl, "Load a recommendation session first.", "error");
        return;
      }
      setStatus(feedbackStatusEl, "Loading feedback...", "");
      try {
        const json = await apiRequest("/api/recommendation-sessions/" + encodeURIComponent(state.sessionId) + "/post-result-feedback", {
          method: "GET",
        });
        renderFeedbackCollection(json.feedback || []);
        setStatus(feedbackStatusEl, "Feedback loaded.", "ok");
      } catch (error) {
        setStatus(feedbackStatusEl, error.message, "error");
      }
    }

    async function onConfirm() {
      if (!state.extractionId) {
        setStatus(confirmStatusEl, "Create extraction first.", "error");
        return;
      }
      setStatus(confirmStatusEl, "Confirming extraction and generating recommendations...", "");
      try {
        const mode = document.getElementById("mode").value;
        const json = await apiRequest("/api/recommendation-extractions/" + encodeURIComponent(state.extractionId) + "/confirm", {
          method: "POST",
          body: JSON.stringify({
            confirmed: true,
            mode,
          }),
        });
        state.sessionId = json.session.sessionId;
        fetchSessionBtn.disabled = false;
        setStatus(confirmStatusEl, "Confirmed. Session " + state.sessionId + " is ready.", "ok");
        await onFetchSession();
      } catch (error) {
        setStatus(confirmStatusEl, error.message, "error");
      }
    }

    async function onFetchSession() {
      if (!state.sessionId) {
        setStatus(confirmStatusEl, "No session yet. Confirm extraction first.", "error");
        return;
      }
      setStatus(confirmStatusEl, "Loading session...", "");
      try {
        const json = await apiRequest("/api/recommendation-sessions/" + encodeURIComponent(state.sessionId), {
          method: "GET",
        });
        renderSession(json.session);
        setStatus(confirmStatusEl, "Session loaded.", "ok");
      } catch (error) {
        setStatus(confirmStatusEl, error.message, "error");
      }
    }

    document.getElementById("btnToken").addEventListener("click", generateLocalToken);
    document.getElementById("btnExtract").addEventListener("click", onCreateExtraction);
    document.getElementById("btnConfirm").addEventListener("click", onConfirm);
    document.getElementById("btnFetchSession").addEventListener("click", onFetchSession);
    document.getElementById("btnSubmitFeedback").addEventListener("click", onSubmitFeedback);
    document.getElementById("btnFetchFeedback").addEventListener("click", onFetchFeedback);
  </script>
</body>
</html>`;
}

async function proxyRequest(config, req, res, targetPath) {
  const token = req.headers["x-auth-token"];
  if (!token || typeof token !== "string" || token.trim() === "") {
    sendJson(res, 401, {
      error: {
        code: "UNAUTHORIZED",
        message: "x-auth-token header is required",
      },
    });
    return;
  }

  let body = undefined;
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    try {
      const parsed = await parseJsonBody(req);
      body = JSON.stringify(parsed);
    } catch (error) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: error.message,
        },
      });
      return;
    }
  }

  const targetUrl = `${config.apiBaseUrl}${targetPath}`;
  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      authorization: `Bearer ${token.trim()}`,
      "content-type": "application/json",
    },
    body,
  });

  const responseJson = await response.json().catch(() => ({}));
  sendJson(res, response.status, responseJson);
}

async function requestHandler(config, req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const method = req.method || "GET";

  if (method === "GET" && path === "/") {
    sendHtml(res, 200, htmlPage(config));
    return;
  }

  if (method === "POST" && path === "/api/recommendation-extractions") {
    await proxyRequest(config, req, res, "/recommendation-extractions");
    return;
  }

  if (method === "POST" && path === "/api/recommendation-extractions/upload") {
    const token = req.headers["x-auth-token"];
    if (!token || typeof token !== "string" || token.trim() === "") {
      sendJson(res, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "x-auth-token header is required",
        },
      });
      return;
    }

    let uploadBody;
    try {
      uploadBody = await parseJsonBody(req);
    } catch (error) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: error.message,
        },
      });
      return;
    }

    const fileName = String(uploadBody.fileName || "upload.png");
    const mimeType = String(uploadBody.mimeType || "image/png");
    const fileBase64 = String(uploadBody.fileBase64 || "").trim();
    if (!fileBase64) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "fileBase64 is required",
        },
      });
      return;
    }

    let pngBytes;
    try {
      pngBytes = Buffer.from(fileBase64, "base64");
    } catch (_error) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "fileBase64 must be valid base64",
        },
      });
      return;
    }

    let extracted;
    try {
      extracted = extractMidjourneyFieldsFromPngBuffer(pngBytes);
    } catch (error) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "PNG metadata extraction failed",
          details: {
            reason: error.message,
          },
        },
      });
      return;
    }

    const targetUrl = `${config.apiBaseUrl}/recommendation-extractions`;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        metadataFields: extracted.metadataFields,
        fileName,
        mimeType,
      }),
    });

    const responseJson = await response.json().catch(() => ({}));
    sendJson(res, response.status, responseJson);
    return;
  }

  if (method === "POST" && path.startsWith("/api/recommendation-extractions/") && path.endsWith("/confirm")) {
    const extractionId = path.slice("/api/recommendation-extractions/".length, -"/confirm".length);
    await proxyRequest(
      config,
      req,
      res,
      `/recommendation-extractions/${encodeURIComponent(extractionId)}/confirm`
    );
    return;
  }

  if (method === "GET" && path.startsWith("/api/recommendation-extractions/")) {
    const extractionId = path.slice("/api/recommendation-extractions/".length);
    await proxyRequest(
      config,
      req,
      res,
      `/recommendation-extractions/${encodeURIComponent(extractionId)}`
    );
    return;
  }

  if (method === "GET" && path.startsWith("/api/recommendation-sessions/")) {
    if (path.endsWith("/post-result-feedback")) {
      const sessionId = path.slice("/api/recommendation-sessions/".length, -"/post-result-feedback".length);
      await proxyRequest(
        config,
        req,
        res,
        `/recommendation-sessions/${encodeURIComponent(sessionId)}/post-result-feedback`
      );
      return;
    }

    const sessionId = path.slice("/api/recommendation-sessions/".length);
    await proxyRequest(
      config,
      req,
      res,
      `/recommendation-sessions/${encodeURIComponent(sessionId)}`
    );
    return;
  }

  if (method === "POST" && path === "/api/generated-images") {
    await proxyRequest(config, req, res, "/generated-images");
    return;
  }

  if (method === "POST" && path === "/api/post-result-feedback") {
    await proxyRequest(config, req, res, "/post-result-feedback");
    return;
  }

  if (method === "GET" && path.startsWith("/api/post-result-feedback/")) {
    const feedbackId = path.slice("/api/post-result-feedback/".length);
    await proxyRequest(
      config,
      req,
      res,
      `/post-result-feedback/${encodeURIComponent(feedbackId)}`
    );
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
}

function main() {
  const config = loadFrontendConfig();
  const server = http.createServer((req, res) => {
    requestHandler(config, req, res).catch((error) => {
      sendJson(res, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      });
    });
  });

  server.listen(config.frontendPort, () => {
    console.log(
      JSON.stringify(
        {
          message: "Frontend server started",
          app_env: config.appEnv,
          frontend_url: `http://127.0.0.1:${config.frontendPort}`,
          api_base_url: config.apiBaseUrl,
        },
        null,
        2
      )
    );
  });
}

main();
