"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

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

type ContributorSubmission = {
  submissionId: string;
  styleInfluence?: {
    styleInfluenceId: string;
    influenceType: "profile" | "sref" | null;
    influenceCode: string;
    status: string;
  };
};

type ContributorListResponse = {
  submissions: ContributorSubmission[];
};

type EndpointProbe = {
  status: number;
  ready: boolean;
};

type PromptJobResponse = {
  promptJob?: {
    promptJobId?: string;
  };
  promptJobId?: string;
  prompts?: Array<{
    promptKey?: string;
    stylizeTier?: number;
    promptTextGenerated?: string;
  }>;
};

type StyleDnaRunSubmitResponse = {
  run?: {
    styleDnaRunId?: string;
  };
  styleDnaRunId?: string;
};

type StyleDnaRunLookupResponse = {
  run?: {
    styleDnaRunId?: string;
    status?: string;
    promptKey?: string;
    stylizeTier?: number;
  };
  result?: {
    canonicalTraits?: {
      dominantDnaTags?: string[];
      vibeShift?: string;
      deltaStrength?: {
        score_1_to_10?: number;
        description?: string;
      };
    };
  };
};

type StyleDnaImageUploadResponse = {
  image?: {
    styleDnaImageId?: string;
  };
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    const error = typeof body.error === "object" && body.error !== null
      ? (body.error as Record<string, unknown>)
      : {};
    const details = typeof error.details === "object" && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
    const reason = typeof details.reason === "string" && details.reason.trim() !== ""
      ? `: ${details.reason}`
      : "";
    const message = typeof error.message === "string"
      ? error.message
      : typeof body.message === "string"
        ? body.message
        : `Request failed (${response.status})`;
    throw new Error(`${message}${reason}`);
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
    reader.onerror = () => reject(new Error("Failed reading file"));
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

async function fetchContributorSubmissions(): Promise<ContributorListResponse> {
  const response = await fetch("/api/proxy/contributor/submissions", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<ContributorListResponse>(response);
}

async function probeStyleDnaApi(): Promise<EndpointProbe> {
  const response = await fetch("/api/proxy/admin/style-dna/baseline-sets", {
    method: "GET",
    cache: "no-store",
  });
  return {
    status: response.status,
    ready: response.status !== 404,
  };
}

export default function StyleDnaAdminPage() {
  const [mjModelFamily, setMjModelFamily] = useState("standard");
  const [mjModelVersion, setMjModelVersion] = useState("6.1");
  const [suiteId, setSuiteId] = useState("bps_default_v1");
  const [seed, setSeed] = useState("42");
  const [quality, setQuality] = useState("1");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [stylizeTier, setStylizeTier] = useState("100");

  const [styleInfluenceId, setStyleInfluenceId] = useState("");
  const [baselineRenderSetId, setBaselineRenderSetId] = useState("");
  const [promptKey, setPromptKey] = useState("pk_001");

  const [styleAdjustmentType, setStyleAdjustmentType] = useState<"sref" | "profile">("sref");
  const [styleAdjustmentMidjourneyId, setStyleAdjustmentMidjourneyId] = useState("");

  const [baselineGridImageId, setBaselineGridImageId] = useState("");
  const [testGridImageId, setTestGridImageId] = useState("");

  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);

  const [lastPromptJobId, setLastPromptJobId] = useState("");
  const [lastStyleDnaRunId, setLastStyleDnaRunId] = useState("");

  const sessionStateQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSessionState,
    refetchInterval: 30_000,
  });

  const contributorListQuery = useQuery({
    queryKey: ["contributor", "submissions"],
    queryFn: fetchContributorSubmissions,
  });

  const styleDnaProbeQuery = useQuery({
    queryKey: ["admin", "style-dna", "probe"],
    queryFn: probeStyleDnaApi,
    retry: false,
  });

  const createBaselineMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/style-dna/baseline-sets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mjModelFamily: mjModelFamily.trim(),
          mjModelVersion: mjModelVersion.trim(),
          suiteId: suiteId.trim(),
          parameterEnvelope: {
            seed: seed.trim(),
            stylizeTier: Number(stylizeTier),
            quality: Number(quality),
            aspectRatio: aspectRatio.trim(),
          },
        }),
      });
      return parseApiResponse<Record<string, unknown>>(response);
    },
    onSuccess: (data) => {
      const baselineRenderSet = typeof data.baselineRenderSet === "object" && data.baselineRenderSet !== null
        ? (data.baselineRenderSet as Record<string, unknown>)
        : null;
      const id = baselineRenderSet && typeof baselineRenderSet.baselineRenderSetId === "string"
        ? baselineRenderSet.baselineRenderSetId
        : "";
      if (id) {
        setBaselineRenderSetId(id);
      }
    },
  });

  const uploadBaselineImageMutation = useMutation({
    mutationFn: async () => {
      if (!baselineFile) {
        throw new Error("Choose a baseline grid file first");
      }
      const response = await fetch("/api/proxy/admin/style-dna/images", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "baseline",
          fileName: baselineFile.name,
          mimeType: baselineFile.type || "image/png",
          fileBase64: await readFileAsBase64(baselineFile),
        }),
      });
      return parseApiResponse<StyleDnaImageUploadResponse>(response);
    },
    onSuccess: (data) => {
      const id = data.image?.styleDnaImageId || "";
      if (id) {
        setBaselineGridImageId(id);
      }
    },
  });

  const attachBaselineItemMutation = useMutation({
    mutationFn: async () => {
      if (!baselineRenderSetId.trim()) {
        throw new Error("Baseline render set id is required");
      }
      if (!promptKey.trim()) {
        throw new Error("Prompt key is required");
      }
      if (!baselineGridImageId.trim()) {
        throw new Error("Baseline grid image id is required");
      }
      const response = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(baselineRenderSetId.trim())}/items`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: promptKey.trim(),
          stylizeTier: Number(stylizeTier),
          gridImageId: baselineGridImageId.trim(),
        }),
      });
      return parseApiResponse<Record<string, unknown>>(response);
    },
  });

  const uploadTestImageMutation = useMutation({
    mutationFn: async () => {
      if (!testFile) {
        throw new Error("Choose a test grid file first");
      }
      const response = await fetch("/api/proxy/admin/style-dna/images", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "test",
          fileName: testFile.name,
          mimeType: testFile.type || "image/png",
          fileBase64: await readFileAsBase64(testFile),
        }),
      });
      return parseApiResponse<StyleDnaImageUploadResponse>(response);
    },
    onSuccess: (data) => {
      const id = data.image?.styleDnaImageId || "";
      if (id) {
        setTestGridImageId(id);
      }
    },
  });

  const promptJobMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/style-dna/prompt-jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          styleInfluenceId: styleInfluenceId.trim(),
          baselineRenderSetId: baselineRenderSetId.trim(),
          styleAdjustmentType,
          styleAdjustmentMidjourneyId: styleAdjustmentMidjourneyId.trim(),
          stylizeTiers: [Number(stylizeTier)],
        }),
      });
      return parseApiResponse<PromptJobResponse>(response);
    },
    onSuccess: (data) => {
      const id = data.promptJob?.promptJobId || data.promptJobId || "";
      setLastPromptJobId(id);
      const firstPromptKey = data.prompts?.[0]?.promptKey;
      if (firstPromptKey) {
        setPromptKey(firstPromptKey);
      }
    },
  });

  const submitRunMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/style-dna/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          styleInfluenceId: styleInfluenceId.trim(),
          baselineRenderSetId: baselineRenderSetId.trim(),
          styleAdjustmentType,
          styleAdjustmentMidjourneyId: styleAdjustmentMidjourneyId.trim(),
          promptKey: promptKey.trim(),
          stylizeTier: Number(stylizeTier),
          testGridImageId: testGridImageId.trim(),
        }),
      });
      return parseApiResponse<StyleDnaRunSubmitResponse>(response);
    },
    onSuccess: (data) => {
      const runId = data.run?.styleDnaRunId || data.styleDnaRunId || "";
      setLastStyleDnaRunId(runId);
    },
  });

  const lookupRunMutation = useMutation({
    mutationFn: async () => {
      if (!lastStyleDnaRunId.trim()) {
        throw new Error("Enter or create a style-dna run id first");
      }
      const response = await fetch(`/api/proxy/admin/style-dna/runs/${encodeURIComponent(lastStyleDnaRunId.trim())}`, {
        method: "GET",
        cache: "no-store",
      });
      return parseApiResponse<StyleDnaRunLookupResponse>(response);
    },
  });

  const availableInfluences = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const submission of contributorListQuery.data?.submissions || []) {
      const influence = submission.styleInfluence;
      if (!influence || !influence.styleInfluenceId || map.has(influence.styleInfluenceId)) {
        continue;
      }
      const typeLabel = influence.influenceType || "unknown";
      map.set(influence.styleInfluenceId, {
        id: influence.styleInfluenceId,
        label: `${influence.styleInfluenceId} (${typeLabel}: ${influence.influenceCode})`,
      });
    }
    return Array.from(map.values());
  }, [contributorListQuery.data]);

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
    <main className="mx-auto min-h-screen w-full max-w-6xl p-6 md:p-10">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          UI Upgrade - Style-DNA Admin Workflow
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">Style-DNA Console</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Use case 1: baseline tests. Use case 2: baseline grid capture. Use case 3: style adjustment comparison.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]">
            Back to Operations Console
          </Link>
          <button
            type="button"
            onClick={() => styleDnaProbeQuery.refetch()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Recheck Endpoint
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">Session: <span className="font-medium text-[var(--ink)]">{authStateLabel}</span></p>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">1) Baseline Test Definition</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={mjModelFamily} onChange={(event) => setMjModelFamily(event.target.value)} placeholder="model family" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={mjModelVersion} onChange={(event) => setMjModelVersion(event.target.value)} placeholder="model version" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={suiteId} onChange={(event) => setSuiteId(event.target.value)} placeholder="suite id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <select value={stylizeTier} onChange={(event) => setStylizeTier(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
            <option value="0">0</option>
            <option value="100">100</option>
            <option value="1000">1000</option>
          </select>
          <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="seed" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={quality} onChange={(event) => setQuality(event.target.value)} placeholder="quality" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} placeholder="aspect ratio" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm md:col-span-2" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => createBaselineMutation.mutate()}
            disabled={createBaselineMutation.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {createBaselineMutation.isPending ? "Creating..." : "Create Baseline Set"}
          </button>
          <input value={baselineRenderSetId} onChange={(event) => setBaselineRenderSetId(event.target.value)} placeholder="baseline render set id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">2) Baseline Grid Capture</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={promptKey} onChange={(event) => setPromptKey(event.target.value)} placeholder="prompt key" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={baselineGridImageId} onChange={(event) => setBaselineGridImageId(event.target.value)} placeholder="baseline style_dna_image_id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBaselineFile(event.target.files?.[0] || null)} className="md:col-span-2 text-sm" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => uploadBaselineImageMutation.mutate()} disabled={uploadBaselineImageMutation.isPending} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            {uploadBaselineImageMutation.isPending ? "Uploading..." : "Upload Baseline Grid"}
          </button>
          <button type="button" onClick={() => attachBaselineItemMutation.mutate()} disabled={attachBaselineItemMutation.isPending} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {attachBaselineItemMutation.isPending ? "Saving..." : "Attach Baseline Grid to Set"}
          </button>
        </div>
      </section>

      <section className="mt-6 mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">3) Style Adjustment Comparison</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select value={styleAdjustmentType} onChange={(event) => setStyleAdjustmentType(event.target.value as "sref" | "profile")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
            <option value="sref">sref</option>
            <option value="profile">profile</option>
          </select>
          <input value={styleAdjustmentMidjourneyId} onChange={(event) => setStyleAdjustmentMidjourneyId(event.target.value)} placeholder="midjourney id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <select value={styleInfluenceId} onChange={(event) => setStyleInfluenceId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm md:col-span-2">
            <option value="">select style influence</option>
            {availableInfluences.map((influence) => (
              <option key={influence.id} value={influence.id}>{influence.label}</option>
            ))}
          </select>
          <input value={testGridImageId} onChange={(event) => setTestGridImageId(event.target.value)} placeholder="test style_dna_image_id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input value={lastStyleDnaRunId} onChange={(event) => setLastStyleDnaRunId(event.target.value)} placeholder="style_dna_run_id" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setTestFile(event.target.files?.[0] || null)} className="md:col-span-2 text-sm" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => promptJobMutation.mutate()} disabled={promptJobMutation.isPending} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            {promptJobMutation.isPending ? "Generating..." : "Generate Prompt"}
          </button>
          <button type="button" onClick={() => uploadTestImageMutation.mutate()} disabled={uploadTestImageMutation.isPending} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            {uploadTestImageMutation.isPending ? "Uploading..." : "Upload Test Grid"}
          </button>
          <button type="button" onClick={() => submitRunMutation.mutate()} disabled={submitRunMutation.isPending} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {submitRunMutation.isPending ? "Submitting..." : "Submit Comparison Run"}
          </button>
          <button type="button" onClick={() => lookupRunMutation.mutate()} disabled={lookupRunMutation.isPending} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            {lookupRunMutation.isPending ? "Loading..." : "Get Run Status"}
          </button>
        </div>
        {lookupRunMutation.data?.run ? (
          <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p><span className="font-medium">Run:</span> {lookupRunMutation.data.run.styleDnaRunId || "(unknown)"}</p>
            <p><span className="font-medium">Status:</span> {lookupRunMutation.data.run.status || "(unknown)"}</p>
            <p><span className="font-medium">Prompt Job:</span> {lastPromptJobId || "(none)"}</p>
            {lookupRunMutation.data.result?.canonicalTraits?.deltaStrength ? (
              <p><span className="font-medium">Delta:</span> {lookupRunMutation.data.result.canonicalTraits.deltaStrength.score_1_to_10}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
