"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

type SessionStateResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      bypassAuth?: boolean;
      session: {
        expiresAt: number | null;
        expiresInSec: number | null;
        subject: string | null;
        email: string | null;
        tokenType: string;
      };
    };

type ExtractionResponse = {
  extraction: {
    extractionId: string;
    status: string;
    prompt: string;
    author?: string | null;
    creationTime?: string | null;
    sourceJobId?: string | null;
    modelFamily?: string | null;
    modelVersion?: string | null;
    isBaseline?: boolean;
    hasProfile?: boolean;
    hasSref?: boolean;
  };
};

type RecommendationSessionResponse = {
  session: {
    sessionId: string;
    status: string;
    mode: "precision" | "close_enough";
    prompt: { promptText: string } | null;
    recommendations: Array<{
      recommendationId: string;
      rank: number;
      combinationId: string;
      rationale: string;
      confidence: number;
      riskNotes: string[];
      promptImprovements: string[];
      lowConfidence?: { isLowConfidence: boolean };
    }>;
  };
};

type GeneratedImageUploadResponse = {
  generatedImage: {
    generatedImageId: string;
    recommendationSessionId: string;
    fileName: string;
    mimeType: string;
    storageUri: string;
    uploadedAt: string;
  };
};

type FeedbackSubmitResponse = {
  feedback: {
    feedbackId: string;
    recommendationSessionId: string;
    recommendationId: string;
    generatedImageId: string | null;
    emojiRating: string | null;
    usefulFlag: boolean | null;
    comments: string | null;
    evidenceStrength: "normal" | "minor";
    submittedAt: string;
  };
  alignment: {
    alignmentEvaluationId: string;
    feedbackId: string;
    alignmentScore: number;
    mismatchSummary: string;
    suggestedPromptAdjustments: string[];
    alternativeCombinationIds: string[];
    confidenceDelta: number;
  };
};

type FeedbackListEntry = FeedbackSubmitResponse["feedback"] & {
  alignment: FeedbackSubmitResponse["alignment"];
};

type SessionFeedbackListResponse = {
  recommendationSessionId: string;
  feedback: FeedbackListEntry[];
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = json?.error?.details?.reason;
    const detailSuffix = typeof reason === "string" && reason.trim() !== ""
      ? `: ${reason}`
      : "";
    const message =
      json?.error?.message
      || json?.message
      || `Request failed (${response.status})`;
    throw new Error(`${message}${detailSuffix}`);
  }
  return json as T;
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const marker = ";base64,";
      const idx = value.indexOf(marker);
      if (idx < 0) {
        reject(new Error("Failed to encode file as base64"));
        return;
      }
      resolve(value.slice(idx + marker.length));
    };
    reader.onerror = () => {
      reject(new Error("Failed reading file"));
    };
    reader.readAsDataURL(file);
  });
}

async function fetchSessionState(): Promise<SessionStateResponse> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<SessionStateResponse>(response);
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("authError");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"precision" | "close_enough">("precision");
  const [extraction, setExtraction] = useState<ExtractionResponse["extraction"] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<RecommendationSessionResponse["session"] | null>(null);
  const [generatedImageFile, setGeneratedImageFile] = useState<File | null>(null);
  const [feedbackRecommendationId, setFeedbackRecommendationId] = useState<string>("");
  const [emojiRating, setEmojiRating] = useState<string>("");
  const [usefulFlag, setUsefulFlag] = useState<"" | "true" | "false">("");
  const [feedbackComments, setFeedbackComments] = useState<string>("");
  const [submittedFeedback, setSubmittedFeedback] = useState<FeedbackSubmitResponse | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<FeedbackListEntry[]>([]);

  const sessionStateQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSessionState,
    refetchInterval: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("Choose a PNG file first");
      }
      const fileBase64 = await readFileAsBase64(selectedFile);
      const response = await fetch("/api/recommendation-extractions/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name || "upload.png",
          mimeType: selectedFile.type || "image/png",
          fileBase64,
        }),
      });
      return parseApiResponse<ExtractionResponse>(response);
    },
    onSuccess: (data) => {
      setExtraction(data.extraction);
      setSessionId(null);
      setSessionResult(null);
      setFeedbackRecommendationId("");
      setSubmittedFeedback(null);
      setSessionFeedback([]);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!extraction?.extractionId) {
        throw new Error("Create extraction first");
      }
      const response = await fetch(
        `/api/proxy/recommendation-extractions/${encodeURIComponent(extraction.extractionId)}/confirm`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            confirmed: true,
            mode,
          }),
        }
      );
      return parseApiResponse<{ session: { sessionId: string } }>(response);
    },
    onSuccess: (data) => {
      setSessionId(data.session.sessionId);
      setSubmittedFeedback(null);
      setSessionFeedback([]);
    },
  });

  const loadSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error("No session id yet");
      }
      const response = await fetch(
        `/api/proxy/recommendation-sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );
      return parseApiResponse<RecommendationSessionResponse>(response);
    },
    onSuccess: (data) => {
      setSessionResult(data.session);
      setFeedbackRecommendationId(data.session.recommendations[0]?.recommendationId || "");
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error("No recommendation session loaded");
      }
      if (!feedbackRecommendationId) {
        throw new Error("Select a recommendation first");
      }

      let generatedImageId: string | null = null;
      if (generatedImageFile) {
        const fileBase64 = await readFileAsBase64(generatedImageFile);
        const uploadResponse = await fetch("/api/proxy/generated-images", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            recommendationSessionId: sessionId,
            fileName: generatedImageFile.name || "generated.png",
            mimeType: generatedImageFile.type || "image/png",
            fileBase64,
          }),
        });
        const uploadJson = await parseApiResponse<GeneratedImageUploadResponse>(uploadResponse);
        generatedImageId = uploadJson.generatedImage.generatedImageId;
      }

      const response = await fetch("/api/proxy/post-result-feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          recommendationSessionId: sessionId,
          recommendationId: feedbackRecommendationId,
          generatedImageId,
          emojiRating: emojiRating || null,
          usefulFlag: usefulFlag === "" ? null : usefulFlag === "true",
          comments: feedbackComments.trim() || null,
        }),
      });
      return parseApiResponse<FeedbackSubmitResponse>(response);
    },
    onSuccess: (data) => {
      setSubmittedFeedback(data);
      setGeneratedImageFile(null);
      setEmojiRating("");
      setUsefulFlag("");
      setFeedbackComments("");
      void listFeedbackMutation.mutateAsync();
    },
  });

  const listFeedbackMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error("No recommendation session loaded");
      }
      const response = await fetch(
        `/api/proxy/recommendation-sessions/${encodeURIComponent(sessionId)}/post-result-feedback`,
        {
          method: "GET",
          cache: "no-store",
        }
      );
      return parseApiResponse<SessionFeedbackListResponse>(response);
    },
    onSuccess: (data) => {
      setSessionFeedback(Array.isArray(data.feedback) ? data.feedback : []);
    },
  });

  const authStateLabel = useMemo(() => {
    if (sessionStateQuery.isLoading) {
      return "loading";
    }
    if (sessionStateQuery.isError) {
      return "error";
    }
    return sessionStateQuery.data?.authenticated ? "authenticated" : "unauthenticated";
  }, [sessionStateQuery.data, sessionStateQuery.isError, sessionStateQuery.isLoading]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-6 md:p-10">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          UI Upgrade - U3 Recommendation Flow
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Extraction to Recommendation Session
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          This page runs the migrated flow on Next.js:
          upload PNG, extract metadata, confirm mode, and fetch ranked recommendations.
        </p>
        <div className="mt-4">
          <a
            href="/admin"
            className="inline-flex rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Open Admin Operations
          </a>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/auth/login"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Sign In
          </a>
          <a
            href="/api/auth/logout"
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Sign Out
          </a>
          <button
            type="button"
            onClick={() => sessionStateQuery.refetch()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Refresh Session
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Session: <span className="font-medium text-[var(--ink)]">{authStateLabel}</span>
          {sessionStateQuery.data?.authenticated && sessionStateQuery.data.bypassAuth
            ? " (local bypass)"
            : ""}
        </p>
        {authError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Auth flow returned error: {authError}
          </p>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">1) Upload PNG and Extract</h2>
        <div className="mt-4 grid gap-3">
          <input
            type="file"
            accept="image/png"
            onChange={(event) => {
              const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
              setSelectedFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
            className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploadMutation.isPending ? "Extracting..." : "Create Extraction"}
          </button>
          {uploadMutation.isError ? (
            <p className="text-sm text-red-700">{(uploadMutation.error as Error).message}</p>
          ) : null}
          {extraction ? (
            <div className="rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
              <p>
                Extraction: <span className="font-mono text-[var(--ink)]">{extraction.extractionId}</span>
              </p>
              <p className="mt-1">
                Prompt: <span className="text-[var(--ink)]">{extraction.prompt}</span>
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">2) Confirm Mode</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as "precision" | "close_enough");
            }}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="precision">precision</option>
            <option value="close_enough">close_enough</option>
          </select>
          <button
            type="button"
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending || !extraction}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {confirmMutation.isPending ? "Confirming..." : "Confirm Extraction"}
          </button>
          {sessionId ? (
            <span className="text-sm text-[var(--muted)]">
              Session: <span className="font-mono text-[var(--ink)]">{sessionId}</span>
            </span>
          ) : null}
        </div>
        {confirmMutation.isError ? (
          <p className="mt-3 text-sm text-red-700">{(confirmMutation.error as Error).message}</p>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">3) Load Session Results</h2>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => loadSessionMutation.mutate()}
            disabled={loadSessionMutation.isPending || !sessionId}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loadSessionMutation.isPending ? "Loading..." : "Fetch Session"}
          </button>
        </div>
        {loadSessionMutation.isError ? (
          <p className="mt-3 text-sm text-red-700">{(loadSessionMutation.error as Error).message}</p>
        ) : null}

        {sessionResult ? (
          <div className="mt-4 rounded-lg border border-[var(--line)] p-4">
            <p className="text-sm text-[var(--muted)]">
              Session status: <span className="text-[var(--ink)]">{sessionResult.status}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Prompt: <span className="text-[var(--ink)]">{sessionResult.prompt?.promptText || "(none)"}</span>
            </p>
            <div className="mt-4 grid gap-3">
              {sessionResult.recommendations.map((item) => (
                <article key={item.recommendationId} className="rounded-lg border border-[var(--line)] p-3">
                  <p className="text-sm font-medium text-[var(--ink)]">
                    #{item.rank} {item.combinationId}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Confidence: <span className="text-[var(--ink)]">{item.confidence}</span>
                    {item.lowConfidence?.isLowConfidence ? " (low-confidence)" : ""}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Rationale: <span className="text-[var(--ink)]">{item.rationale}</span>
                  </p>
                  {item.riskNotes.length > 0 ? (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Risk notes: <span className="text-[var(--ink)]">{item.riskNotes.join(" | ")}</span>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">4) Submit Post-Result Feedback</h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Recommendation
            <select
              value={feedbackRecommendationId}
              onChange={(event) => {
                setFeedbackRecommendationId(event.target.value);
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
              disabled={!sessionResult || sessionResult.recommendations.length === 0}
            >
              <option value="">Select recommendation</option>
              {(sessionResult?.recommendations || []).map((item) => (
                <option key={item.recommendationId} value={item.recommendationId}>
                  #{item.rank} - {item.combinationId} ({item.recommendationId})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Generated Image (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
                setGeneratedImageFile(file);
              }}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[var(--muted)]">
              Emoji Rating (optional)
              <select
                value={emojiRating}
                onChange={(event) => {
                  setEmojiRating(event.target.value);
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option value="">(none)</option>
                <option value="🙂">🙂</option>
                <option value="☹️">☹️</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm text-[var(--muted)]">
              Useful? (optional)
              <select
                value={usefulFlag}
                onChange={(event) => {
                  setUsefulFlag(event.target.value as "" | "true" | "false");
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option value="">(none)</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Comments (optional)
            <textarea
              value={feedbackComments}
              onChange={(event) => {
                setFeedbackComments(event.target.value);
              }}
              placeholder="What matched or missed?"
              className="min-h-20 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submitFeedbackMutation.mutate()}
              disabled={submitFeedbackMutation.isPending || !sessionId}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
            </button>
            <button
              type="button"
              onClick={() => listFeedbackMutation.mutate()}
              disabled={listFeedbackMutation.isPending || !sessionId}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
            >
              {listFeedbackMutation.isPending ? "Loading..." : "Fetch Session Feedback"}
            </button>
          </div>

          {submitFeedbackMutation.isError ? (
            <p className="text-sm text-red-700">{(submitFeedbackMutation.error as Error).message}</p>
          ) : null}
          {listFeedbackMutation.isError ? (
            <p className="text-sm text-red-700">{(listFeedbackMutation.error as Error).message}</p>
          ) : null}

          {submittedFeedback ? (
            <div className="rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
              <p>
                Feedback: <span className="font-mono text-[var(--ink)]">{submittedFeedback.feedback.feedbackId}</span>
              </p>
              <p className="mt-1">
                Evidence: <span className="text-[var(--ink)]">{submittedFeedback.feedback.evidenceStrength}</span>
              </p>
              <p className="mt-1">
                Alignment score: <span className="text-[var(--ink)]">{submittedFeedback.alignment.alignmentScore}</span>
                {" "} (delta <span className="text-[var(--ink)]">{submittedFeedback.alignment.confidenceDelta}</span>)
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">5) Session Feedback List</h2>
        <div className="mt-4 grid gap-3">
          {sessionFeedback.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No feedback submitted for this session yet.</p>
          ) : (
            sessionFeedback.map((entry) => (
              <article key={entry.feedbackId} className="rounded-lg border border-[var(--line)] p-3">
                <p className="text-sm font-medium text-[var(--ink)]">
                  {entry.feedbackId}
                  <span className="ml-2 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
                    {entry.evidenceStrength}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Emoji: <span className="text-[var(--ink)]">{entry.emojiRating || "(none)"}</span>
                  {" | "}Useful: <span className="text-[var(--ink)]">
                    {entry.usefulFlag === null ? "(none)" : String(entry.usefulFlag)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Comments: <span className="text-[var(--ink)]">{entry.comments || "(none)"}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Alignment: <span className="text-[var(--ink)]">{entry.alignment.alignmentScore}</span>
                  {" | "}Delta: <span className="text-[var(--ink)]">{entry.alignment.confidenceDelta}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Mismatch: <span className="text-[var(--ink)]">{entry.alignment.mismatchSummary}</span>
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
