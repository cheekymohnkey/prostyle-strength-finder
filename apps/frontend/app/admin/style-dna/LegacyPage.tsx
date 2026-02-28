"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

type StyleInfluenceCatalogItem = {
  styleInfluenceId?: string;
  typeKey?: "profile" | "sref" | string | null;
  influenceCode?: string;
  status?: string;
};

type StyleInfluenceListResponse = {
  styleInfluences?: StyleInfluenceCatalogItem[];
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
    cellId?: string;
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

type TraitSummaryResponse = {
  styleInfluenceId?: string;
  summary?: {
    completedRunCount?: number;
    completedPromptCount?: number;
    completedCellCount?: number;
    averageDeltaStrength?: number | null;
    topDnaTags?: Array<{ value?: string; count?: number }>;
    topVibeShifts?: Array<{ value?: string; count?: number }>;
    topAtomicTraits?: Array<{ axis?: string; trait?: string; count?: number }>;
    recentRuns?: Array<{
      styleDnaRunId?: string;
      promptKey?: string;
      stylizeTier?: number;
      summary?: string | null;
      createdAt?: string;
    }>;
  };
};

type TraitDiscoveryCandidate = {
  canonicalTraitId?: string;
  displayLabel?: string;
  lexicalSimilarity?: number;
  semanticSimilarity?: number;
};

type TraitDiscovery = {
  discoveryId?: string;
  taxonomyVersion?: string;
  axis?: string;
  rawTraitText?: string;
  normalizedTrait?: string;
  status?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  seenCount?: number;
  topCandidates?: TraitDiscoveryCandidate[];
  resolutionPayload?: {
    action?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    note?: string | null;
    canonicalTraitId?: string;
    canonicalDisplayLabel?: string;
  };
};

type TraitDiscoveryListResponse = {
  discoveries?: TraitDiscovery[];
};

type CanonicalTrait = {
  canonicalTraitId?: string;
  taxonomyVersion?: string;
  axis?: string;
  displayLabel?: string;
  normalizedLabel?: string;
  status?: "active" | "deprecated" | string;
  createdAt?: string;
  updatedAt?: string | null;
  createdBy?: string;
  notes?: string | null;
};

type CanonicalTraitListResponse = {
  canonicalTraits?: CanonicalTrait[];
};

type CanonicalTraitMutationResponse = {
  canonicalTrait?: CanonicalTrait;
  deduplicated?: boolean;
  changed?: boolean;
};

type TraitAlias = {
  aliasId?: string;
  taxonomyVersion?: string;
  axis?: string;
  aliasText?: string;
  normalizedAlias?: string;
  canonicalTraitId?: string;
  source?: string;
  mergeMethod?: string;
  lexicalSimilarity?: number | null;
  semanticSimilarity?: number | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string | null;
  createdBy?: string;
  reviewNote?: string | null;
};

type TraitAliasListResponse = {
  traitAliases?: TraitAlias[];
};

type TraitAliasMutationResponse = {
  traitAlias?: TraitAlias;
  deduplicated?: boolean;
};

type OpenAiDebugEvent = {
  timestamp?: string;
  sessionId?: string;
  adapter?: string;
  operation?: string;
  model?: string | null;
  url?: string | null;
  phase?: string;
  status?: number;
  requestBodyRaw?: string;
  responseBodyRaw?: string;
  errorMessage?: string;
};

type OpenAiDebugLogResponse = {
  enabled?: boolean;
  logPath?: string;
  events?: OpenAiDebugEvent[];
};

type Section3PromptProgress = {
  copied?: boolean;
  generatedPromptText?: string;
  testGridImageId?: string;
  runId?: string;
  runStatus?: string;
  result?: StyleDnaRunLookupResponse["result"];
};

type Section3TestFamily = "profile_triplet" | "sref_matrix";

type Section3TestCell = {
  cellId: string;
  label: string;
  stylizeTier: number;
  styleWeight?: number;
};

type StyleDnaImageUploadResponse = {
  image?: {
    styleDnaImageId?: string;
    storageUri?: string;
    mimeType?: string;
  };
};

type BaselinePromptDefinition = {
  promptKey: string;
  promptText: string;
  displayOrder: number;
  domain?: string | null;
  whatItTests?: string | null;
};

type BaselineSetDetailResponse = {
  baselineRenderSet?: {
    baselineRenderSetId?: string;
    mjModelFamily?: string;
    mjModelVersion?: string;
    suiteId?: string;
    parameterEnvelope?: {
      seed?: number | string;
      stylizeTier?: number | string;
      quality?: number | string;
      aspectRatio?: string;
      styleRaw?: boolean;
      styleWeight?: number | string;
    };
  };
  baselinePromptSuite?: {
    suiteId?: string;
    name?: string;
    suiteVersion?: string;
  };
  items?: Array<{
    promptKey?: string;
    stylizeTier?: number;
    gridImageId?: string;
  }>;
  promptDefinitions?: BaselinePromptDefinition[];
};

type BaselineSetSummary = {
  baselineRenderSetId: string;
  suiteId: string;
  mjModelFamily: string;
  mjModelVersion: string;
  parameterEnvelope?: {
    stylizeTier?: number | string;
  };
};

type BaselineSetListResponse = {
  baselineSets?: BaselineSetSummary[];
};

class ApiRequestError extends Error {
  status: number;
  code: string;
  reason: string;

  constructor(message: string, input: { status: number; code?: string; reason?: string }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = input.status;
    this.code = String(input.code || "REQUEST_FAILED");
    this.reason = String(input.reason || "");
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    const error = typeof body.error === "object" && body.error !== null
      ? (body.error as Record<string, unknown>)
      : {};
    const code = typeof error.code === "string" ? error.code : "REQUEST_FAILED";
    const details = typeof error.details === "object" && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
    const reason = typeof details.reason === "string" ? details.reason.trim() : "";
    const message = typeof error.message === "string"
      ? error.message
      : typeof body.message === "string"
        ? body.message
        : `Request failed (${response.status})`;
    throw new ApiRequestError(
      reason !== "" ? `${message}: ${reason}` : message,
      { status: response.status, code, reason }
    );
  }
  return json as T;
}

function mutationErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return "Session is not authenticated. Sign in again and retry.";
    }
    if (error.status === 403) {
      return "Access denied. Use an admin-authenticated session for this action.";
    }
    if (error.status === 409) {
      return error.reason || "Request conflicts with current baseline/run state. Reload data and retry.";
    }
    if (error.status === 422) {
      return error.reason || "Request validation failed. Verify required fields and input values.";
    }
    return `${error.message} [${error.code}]`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed";
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

async function fetchStyleInfluences(): Promise<StyleInfluenceListResponse> {
  const response = await fetch("/api/proxy/admin/style-influences?status=active&limit=500", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<StyleInfluenceListResponse>(response);
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

async function fetchBaselineSetDetail(baselineRenderSetId: string): Promise<BaselineSetDetailResponse> {
  const response = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(baselineRenderSetId)}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<BaselineSetDetailResponse>(response);
}

async function fetchBaselineSetList(): Promise<BaselineSetListResponse> {
  const response = await fetch("/api/proxy/admin/style-dna/baseline-sets?limit=200", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<BaselineSetListResponse>(response);
}

async function fetchStyleInfluenceTraitSummary(styleInfluenceId: string): Promise<TraitSummaryResponse> {
  const response = await fetch(`/api/proxy/admin/style-dna/style-influences/${encodeURIComponent(styleInfluenceId)}/trait-summary?limit=1000`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<TraitSummaryResponse>(response);
}

async function fetchTraitDiscoveriesByStatus(
  status: "pending_review" | "approved_alias" | "approved_new_canonical" | "rejected" | "ignored",
  limit = 100
): Promise<TraitDiscoveryListResponse> {
  const response = await fetch(`/api/proxy/admin/style-dna/trait-discoveries?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<TraitDiscoveryListResponse>(response);
}

async function fetchCanonicalTraits(input: {
  axis?: string;
  status?: "active" | "deprecated" | "";
  limit?: number;
} = {}): Promise<CanonicalTraitListResponse> {
  const params = new URLSearchParams();
  if (input.axis && input.axis.trim() !== "") {
    params.set("axis", input.axis.trim());
  }
  if (input.status && input.status.trim() !== "") {
    params.set("status", input.status.trim());
  }
  params.set("limit", String(input.limit || 500));
  const response = await fetch(`/api/proxy/admin/style-dna/canonical-traits?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<CanonicalTraitListResponse>(response);
}

async function fetchTraitAliases(input: {
  axis?: string;
  status?: "active" | "deprecated" | "";
  limit?: number;
} = {}): Promise<TraitAliasListResponse> {
  const params = new URLSearchParams();
  if (input.axis && input.axis.trim() !== "") {
    params.set("axis", input.axis.trim());
  }
  if (input.status && input.status.trim() !== "") {
    params.set("status", input.status.trim());
  }
  params.set("limit", String(input.limit || 500));
  const query = params.toString();
  const response = await fetch(`/api/proxy/admin/style-dna/trait-aliases${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<TraitAliasListResponse>(response);
}

async function fetchOpenAiDebugLog(limit = 100): Promise<OpenAiDebugLogResponse> {
  const response = await fetch(`/api/proxy/admin/debug/openai?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<OpenAiDebugLogResponse>(response);
}

function fileExtensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "bin";
}

async function readClipboardImageFile(fileNamePrefix: string): Promise<File> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    throw new Error("Clipboard image read is not supported in this browser");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) {
      continue;
    }
    const blob = await item.getType(imageType);
    if (!blob || blob.size === 0) {
      continue;
    }
    const extension = fileExtensionForMimeType(imageType);
    return new File([blob], `${fileNamePrefix}-${Date.now()}.${extension}`, {
      type: imageType,
    });
  }

  throw new Error("Clipboard does not contain an image");
}

function readImageFileFromClipboardData(data: DataTransfer | null, fileNamePrefix: string): File | null {
  if (!data) {
    return null;
  }
  const file = Array.from(data.files || []).find((entry) => entry.type.startsWith("image/"));
  if (!file) {
    return null;
  }
  const extension = fileExtensionForMimeType(file.type || "image/png");
  return new File([file], `${fileNamePrefix}-${Date.now()}.${extension}`, {
    type: file.type || "image/png",
  });
}

function styleDnaImageContentPath(styleDnaImageId: string): string {
  return `/api/proxy/admin/style-dna/images/${encodeURIComponent(styleDnaImageId)}/content`;
}

function buildStyleDnaProvenanceReceipt(input: { imageKind: "baseline" | "test"; fileName: string }) {
  return {
    source: "studio_manual_upload",
    capturedAtUtc: new Date().toISOString(),
    operatorAssertion: `${input.imageKind}_grid_uploaded_via_legacy_studio:${input.fileName}`,
  };
}

function section3ProgressKey(promptKey: string, cellId: string): string {
  return `${promptKey}::${cellId}`;
}

export default function StyleDnaAdminPage() {
  const [mjModelFamily, setMjModelFamily] = useState("standard");
  const [mjModelVersion, setMjModelVersion] = useState("7");
  const [suiteId, setSuiteId] = useState("suite_style_dna_default_v1");
  const [seed, setSeed] = useState("42");
  const [quality, setQuality] = useState("1");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [stylizeTier, setStylizeTier] = useState("100");

  const [styleInfluenceId, setStyleInfluenceId] = useState("");
  const [baselineRenderSetId, setBaselineRenderSetId] = useState("");
  const [promptKey, setPromptKey] = useState("pk_001");

  const [styleAdjustmentType, setStyleAdjustmentType] = useState<"sref" | "profile">("sref");
  const [styleAdjustmentMidjourneyId, setStyleAdjustmentMidjourneyId] = useState("");
  const [section3TestFamily, setSection3TestFamily] = useState<Section3TestFamily>("sref_matrix");
  const [selectedSection3CellId, setSelectedSection3CellId] = useState("sref_s0_sw0");

  const [baselineGridImageId, setBaselineGridImageId] = useState("");
  const [testGridImageId, setTestGridImageId] = useState("");

  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);

  const [lastPromptJobId, setLastPromptJobId] = useState("");
  const [lastStyleDnaRunId, setLastStyleDnaRunId] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copiedRemainingPromptKeys, setCopiedRemainingPromptKeys] = useState<Record<string, boolean>>({});
  const [baselineClipboardStatus, setBaselineClipboardStatus] = useState("");
  const [testClipboardStatus, setTestClipboardStatus] = useState("");
  const [brokenUploadedThumbnailIds, setBrokenUploadedThumbnailIds] = useState<Record<string, boolean>>({});
  const [uploadedBaselinePreviewUrl, setUploadedBaselinePreviewUrl] = useState("");
  const [uploadedTestPreviewUrl, setUploadedTestPreviewUrl] = useState("");
  const [baselineFilePreviewUrl, setBaselineFilePreviewUrl] = useState("");
  const [testFilePreviewUrl, setTestFilePreviewUrl] = useState("");
  const [section3PromptProgress, setSection3PromptProgress] = useState<Record<string, Section3PromptProgress>>({});
  const [showOpenAiDebugPanel, setShowOpenAiDebugPanel] = useState(false);
  const [openAiDebugPollingEnabled, setOpenAiDebugPollingEnabled] = useState(true);
  const [discoveryCreateLabelById, setDiscoveryCreateLabelById] = useState<Record<string, string>>({});
  const [reviewHistoryStatus, setReviewHistoryStatus] = useState<"approved_alias" | "approved_new_canonical" | "rejected" | "ignored">("approved_alias");
  const [canonicalAxisFilter, setCanonicalAxisFilter] = useState("lighting_and_contrast");
  const [canonicalStatusFilter, setCanonicalStatusFilter] = useState<"active" | "deprecated" | "">("active");
  const [canonicalCreateLabel, setCanonicalCreateLabel] = useState("");
  const [canonicalCreateNote, setCanonicalCreateNote] = useState("");
  const [selectedCanonicalTraitId, setSelectedCanonicalTraitId] = useState("");
  const [aliasStatusFilter, setAliasStatusFilter] = useState<"active" | "deprecated" | "">("");
  const [aliasCreateText, setAliasCreateText] = useState("");
  const [aliasCreateNote, setAliasCreateNote] = useState("");
  const queryClient = useQueryClient();

  const sessionStateQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSessionState,
    refetchInterval: 30_000,
  });

  const styleInfluenceListQuery = useQuery({
    queryKey: ["admin", "style-influences"],
    queryFn: fetchStyleInfluences,
  });

  const styleDnaProbeQuery = useQuery({
    queryKey: ["admin", "style-dna", "probe"],
    queryFn: probeStyleDnaApi,
    retry: false,
  });

  const baselineSetListQuery = useQuery({
    queryKey: ["admin", "style-dna", "baseline-sets"],
    queryFn: fetchBaselineSetList,
    enabled: styleDnaProbeQuery.data?.ready === true,
  });

  const baselineSetDetailQuery = useQuery({
    queryKey: ["admin", "style-dna", "baseline-set", baselineRenderSetId.trim()],
    queryFn: () => fetchBaselineSetDetail(baselineRenderSetId.trim()),
    enabled: baselineRenderSetId.trim() !== "" && styleDnaProbeQuery.data?.ready === true,
  });

  const styleInfluenceTraitSummaryQuery = useQuery({
    queryKey: ["admin", "style-dna", "trait-summary", styleInfluenceId.trim()],
    queryFn: () => fetchStyleInfluenceTraitSummary(styleInfluenceId.trim()),
    enabled: styleInfluenceId.trim() !== "" && styleDnaProbeQuery.data?.ready === true,
  });

  const traitDiscoveriesQuery = useQuery({
    queryKey: ["admin", "style-dna", "trait-discoveries", "pending_review"],
    queryFn: () => fetchTraitDiscoveriesByStatus("pending_review", 200),
    enabled: styleDnaProbeQuery.data?.ready === true,
    refetchInterval: 15_000,
  });
  const traitDiscoveryHistoryQuery = useQuery({
    queryKey: ["admin", "style-dna", "trait-discoveries", "history", reviewHistoryStatus],
    queryFn: () => fetchTraitDiscoveriesByStatus(reviewHistoryStatus, 200),
    enabled: styleDnaProbeQuery.data?.ready === true,
  });
  const canonicalTraitsQuery = useQuery({
    queryKey: ["admin", "style-dna", "canonical-traits", canonicalAxisFilter, canonicalStatusFilter],
    queryFn: () => fetchCanonicalTraits({
      axis: canonicalAxisFilter,
      status: canonicalStatusFilter,
      limit: 500,
    }),
    enabled: styleDnaProbeQuery.data?.ready === true,
  });
  const traitAliasesQuery = useQuery({
    queryKey: ["admin", "style-dna", "trait-aliases", canonicalAxisFilter, aliasStatusFilter],
    queryFn: () => fetchTraitAliases({
      axis: canonicalAxisFilter,
      status: aliasStatusFilter,
      limit: 500,
    }),
    enabled: styleDnaProbeQuery.data?.ready === true,
  });

  const openAiDebugLogQuery = useQuery({
    queryKey: ["admin", "debug", "openai"],
    queryFn: () => fetchOpenAiDebugLog(100),
    enabled: showOpenAiDebugPanel && openAiDebugPollingEnabled && styleDnaProbeQuery.data?.ready === true,
    refetchInterval: showOpenAiDebugPanel && openAiDebugPollingEnabled ? 5000 : false,
    retry: false,
  });

  useEffect(() => {
    if (openAiDebugLogQuery.error instanceof ApiRequestError && openAiDebugLogQuery.error.status === 404) {
      setOpenAiDebugPollingEnabled(false);
    }
  }, [openAiDebugLogQuery.error]);

  const baselinePromptDefinitions = useMemo(() => (
    [...(baselineSetDetailQuery.data?.promptDefinitions || [])]
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
  ), [baselineSetDetailQuery.data?.promptDefinitions]);

  const baselineItems = baselineSetDetailQuery.data?.items || [];
  const baselineEnvelope = baselineSetDetailQuery.data?.baselineRenderSet?.parameterEnvelope;
  const baselineModelVersion = String(baselineSetDetailQuery.data?.baselineRenderSet?.mjModelVersion || "").trim();
  const envelopeStylizeTier = baselineEnvelope?.stylizeTier !== undefined
    ? Number(baselineEnvelope.stylizeTier)
    : Number.NaN;
  const activeBaselineStylizeTier = Number.isFinite(envelopeStylizeTier)
    ? envelopeStylizeTier
    : Number(stylizeTier);

  const requiredPromptRows = useMemo(() => baselinePromptDefinitions.map((definition) => {
    const matchedItem = baselineItems.find((item) => (
      item.promptKey === definition.promptKey && Number(item.stylizeTier || 0) === Number(activeBaselineStylizeTier || 0)
    ));
    return {
      definition,
      complete: Boolean(matchedItem?.gridImageId),
      attachedGridImageId: matchedItem?.gridImageId || "",
    };
  }), [activeBaselineStylizeTier, baselineItems, baselinePromptDefinitions]);

  const missingPromptRows = requiredPromptRows.filter((row) => !row.complete);
  const uploadedPromptRows = requiredPromptRows.filter((row) => row.complete);
  const missingPromptKeySignature = useMemo(
    () => missingPromptRows.map((row) => row.definition.promptKey).join("|"),
    [missingPromptRows]
  );
  const hasPromptDefinitions = baselinePromptDefinitions.length > 0;
  const selectedPromptDefinition = baselinePromptDefinitions.find((item) => item.promptKey === promptKey) || null;

  const baselinePromptLines = useMemo(() => missingPromptRows.map(({ definition }) => {
    const parts = [definition.promptText];
    const ratio = String(baselineEnvelope?.aspectRatio || "").trim();
    const seedValue = String(baselineEnvelope?.seed || "").trim();
    const qualityValue = String(baselineEnvelope?.quality || "").trim();
    if (ratio !== "") {
      parts.push(`--ar ${ratio}`);
    }
    if (seedValue !== "") {
      parts.push(`--seed ${seedValue}`);
    }
    if (baselineEnvelope?.styleRaw !== false) {
      parts.push("--raw");
    }
    parts.push(`--stylize ${Number(activeBaselineStylizeTier || 0)}`);
    if (baselineModelVersion !== "") {
      parts.push(`--v ${baselineModelVersion}`);
    }
    if (qualityValue !== "") {
      parts.push(`--q ${qualityValue}`);
    }
    return parts.join(" ");
  }), [activeBaselineStylizeTier, baselineEnvelope?.aspectRatio, baselineEnvelope?.quality, baselineEnvelope?.seed, baselineEnvelope?.styleRaw, baselineModelVersion, missingPromptRows]);
  const selectedPromptLine = useMemo(() => {
    if (!selectedPromptDefinition) {
      return "";
    }
    const row = missingPromptRows.find((entry) => entry.definition.promptKey === selectedPromptDefinition.promptKey);
    if (!row) {
      return selectedPromptDefinition.promptText;
    }
    const index = missingPromptRows.findIndex((entry) => entry.definition.promptKey === selectedPromptDefinition.promptKey);
    return baselinePromptLines[index] || selectedPromptDefinition.promptText;
  }, [baselinePromptLines, missingPromptRows, selectedPromptDefinition]);
  const missingPromptLineByKey = useMemo(() => {
    const linesByKey: Record<string, string> = {};
    missingPromptRows.forEach((row, index) => {
      linesByKey[row.definition.promptKey] = baselinePromptLines[index] || row.definition.promptText;
    });
    return linesByKey;
  }, [baselinePromptLines, missingPromptRows]);

  const section3TestCells = useMemo<Section3TestCell[]>(() => {
    if (section3TestFamily === "profile_triplet") {
      return [
        { cellId: "profile_s0", label: "--s 0", stylizeTier: 0 },
        { cellId: "profile_s100", label: "--s 100", stylizeTier: 100 },
        { cellId: "profile_s1000", label: "--s 1000", stylizeTier: 1000 },
      ];
    }
    return [
      { cellId: "sref_s0_sw0", label: "--s 0 --sw 0", stylizeTier: 0, styleWeight: 0 },
      { cellId: "sref_s0_sw1000", label: "--s 0 --sw 1000", stylizeTier: 0, styleWeight: 1000 },
      { cellId: "sref_s1000_sw1000", label: "--s 1000 --sw 1000", stylizeTier: 1000, styleWeight: 1000 },
      { cellId: "sref_s100_sw250", label: "--s 100 --sw 250", stylizeTier: 100, styleWeight: 250 },
    ];
  }, [section3TestFamily]);

  function buildSection3PromptLine(input: { promptText: string; stylize: number; styleWeight?: number }): string {
    const parts: string[] = [input.promptText];
    const ratio = String(baselineEnvelope?.aspectRatio || "").trim();
    const seedValue = String(baselineEnvelope?.seed || "").trim();
    const qualityValue = String(baselineEnvelope?.quality || "").trim();
    if (ratio !== "") {
      parts.push(`--ar ${ratio}`);
    }
    if (seedValue !== "") {
      parts.push(`--seed ${seedValue}`);
    }
    if (baselineEnvelope?.styleRaw !== false) {
      parts.push("--raw");
    }
    if (styleAdjustmentType === "profile") {
      parts.push(`--profile ${styleAdjustmentMidjourneyId.trim()}`);
    } else {
      parts.push(`--sref ${styleAdjustmentMidjourneyId.trim()}`);
      if (Number.isFinite(Number(input.styleWeight))) {
        parts.push(`--sw ${Number(input.styleWeight)}`);
      }
    }
    parts.push(`--stylize ${Number(input.stylize)}`);
    if (baselineModelVersion !== "") {
      parts.push(`--v ${baselineModelVersion}`);
    }
    if (qualityValue !== "") {
      parts.push(`--q ${qualityValue}`);
    }
    return parts.join(" ");
  }

  useEffect(() => {
    const loaded = baselineSetDetailQuery.data?.baselineRenderSet;
    if (!loaded) {
      return;
    }
    const loadedEnvelope = loaded.parameterEnvelope || {};
    const loadedTier = loadedEnvelope.stylizeTier;
    setMjModelFamily(String(loaded.mjModelFamily || "").trim() || "standard");
    setMjModelVersion(String(loaded.mjModelVersion || "").trim());
    setSuiteId(String(loaded.suiteId || "").trim());
    setSeed(loadedEnvelope.seed === undefined || loadedEnvelope.seed === null ? "" : String(loadedEnvelope.seed));
    setQuality(loadedEnvelope.quality === undefined || loadedEnvelope.quality === null ? "" : String(loadedEnvelope.quality));
    setAspectRatio(String(loadedEnvelope.aspectRatio || "").trim());
    if (loadedTier !== undefined && loadedTier !== null) {
      setStylizeTier(String(loadedTier));
    }
  }, [
    baselineSetDetailQuery.data?.baselineRenderSet?.baselineRenderSetId,
    baselineSetDetailQuery.data?.baselineRenderSet?.mjModelFamily,
    baselineSetDetailQuery.data?.baselineRenderSet?.mjModelVersion,
    baselineSetDetailQuery.data?.baselineRenderSet?.suiteId,
    baselineSetDetailQuery.data?.baselineRenderSet?.parameterEnvelope,
  ]);

  useEffect(() => {
    if (baselinePromptDefinitions.length === 0) {
      return;
    }
    const currentExists = baselinePromptDefinitions.some((row) => row.promptKey === promptKey);
    if (currentExists) {
      return;
    }
    const firstMissing = missingPromptRows[0]?.definition?.promptKey;
    const fallback = baselinePromptDefinitions[0]?.promptKey;
    const next = firstMissing || fallback;
    if (next) {
      setPromptKey(next);
    }
  }, [baselinePromptDefinitions, missingPromptRows, promptKey]);

  useEffect(() => {
    setCopiedRemainingPromptKeys((previous) => {
      const next: Record<string, boolean> = {};
      for (const row of missingPromptRows) {
        if (previous[row.definition.promptKey]) {
          next[row.definition.promptKey] = true;
        }
      }
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (
        previousKeys.length === nextKeys.length
        && previousKeys.every((key) => next[key] === previous[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [missingPromptKeySignature, missingPromptRows]);

  useEffect(() => {
    setSection3PromptProgress((previous) => {
      const keys = new Set(
        baselinePromptDefinitions.flatMap((row) => (
          section3TestCells.map((cell) => section3ProgressKey(row.promptKey, cell.cellId))
        ))
      );
      const next: Record<string, Section3PromptProgress> = {};
      for (const [key, value] of Object.entries(previous)) {
        if (keys.has(key)) {
          next[key] = value;
        }
      }
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (
        previousKeys.length === nextKeys.length
        && previousKeys.every((key) => next[key] === previous[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [baselinePromptDefinitions, section3TestCells]);

  useEffect(() => {
    if (section3TestCells.length === 0) {
      return;
    }
    const exists = section3TestCells.some((cell) => cell.cellId === selectedSection3CellId);
    if (!exists) {
      setSelectedSection3CellId(section3TestCells[0].cellId);
    }
  }, [section3TestCells, selectedSection3CellId]);

  useEffect(() => {
    if (!baselineFile) {
      setBaselineFilePreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(baselineFile);
    setBaselineFilePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [baselineFile]);

  useEffect(() => {
    if (!testFile) {
      setTestFilePreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(testFile);
    setTestFilePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [testFile]);

  async function copyMissingBaselinePrompts() {
    if (baselinePromptLines.length === 0) {
      setCopyStatus("No remaining prompts to copy.");
      return;
    }
    await navigator.clipboard.writeText(baselinePromptLines.join("\n"));
    setCopyStatus(`Copied ${baselinePromptLines.length} baseline prompt(s).`);
  }

  async function copySelectedPromptLine() {
    if (!selectedPromptLine || selectedPromptLine.trim() === "") {
      setCopyStatus("No selected prompt available to copy.");
      return;
    }
    await navigator.clipboard.writeText(selectedPromptLine);
    setCopyStatus("Copied selected prompt.");
  }

  async function copyRemainingPromptLine(promptKeyToCopy: string) {
    const line = missingPromptLineByKey[promptKeyToCopy];
    if (!line) {
      setCopyStatus("Prompt line is not available to copy.");
      return;
    }
    await navigator.clipboard.writeText(line);
    setCopiedRemainingPromptKeys((previous) => ({
      ...previous,
      [promptKeyToCopy]: true,
    }));
    setCopyStatus(`Copied prompt ${promptKeyToCopy}.`);
  }

  async function copySection3Prompt(promptKeyToCopy: string, cellIdToCopy: string) {
    const key = section3ProgressKey(promptKeyToCopy, cellIdToCopy);
    const generatedPromptText = section3PromptProgress[key]?.generatedPromptText || "";
    if (!generatedPromptText.trim()) {
      setCopyStatus("Generate prompts first for this style adjustment.");
      return;
    }
    await navigator.clipboard.writeText(generatedPromptText);
    setSection3PromptProgress((previous) => ({
      ...previous,
      [key]: {
        ...(previous[key] || {}),
        copied: true,
      },
    }));
    setCopyStatus(`Copied Section 3 prompt ${promptKeyToCopy} (${cellIdToCopy}).`);
  }

  async function pasteBaselineImageFromClipboard() {
    setBaselineClipboardStatus("");
    try {
      const file = await readClipboardImageFile("baseline-grid");
      setBaselineFile(file);
      setBaselineClipboardStatus(`Image pasted: ${file.name}`);
    } catch (error) {
      setBaselineClipboardStatus(error instanceof Error ? error.message : "Clipboard paste failed");
    }
  }

  async function pasteTestImageFromClipboard() {
    setTestClipboardStatus("");
    try {
      const file = await readClipboardImageFile("test-grid");
      setTestFile(file);
      setTestClipboardStatus(`Image pasted: ${file.name}`);
    } catch (error) {
      setTestClipboardStatus(error instanceof Error ? error.message : "Clipboard paste failed");
    }
  }

  function handleBaselinePasteEvent(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = readImageFileFromClipboardData(event.clipboardData, "baseline-grid");
    if (!file) {
      return;
    }
    event.preventDefault();
    setBaselineFile(file);
    setBaselineClipboardStatus(`Image pasted: ${file.name}`);
  }

  function handleTestPasteEvent(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = readImageFileFromClipboardData(event.clipboardData, "test-grid");
    if (!file) {
      return;
    }
    event.preventDefault();
    setTestFile(file);
    setTestClipboardStatus(`Image pasted: ${file.name}`);
  }

  function clearBaselineImageSelection() {
    setBaselineFile(null);
    setBaselineFilePreviewUrl("");
    setUploadedBaselinePreviewUrl("");
    setBaselineGridImageId("");
    setBaselineClipboardStatus("Baseline image selection cleared.");
  }

  function clearTestImageSelection() {
    setTestFile(null);
    setTestFilePreviewUrl("");
    setUploadedTestPreviewUrl("");
    setTestGridImageId("");
    setTestClipboardStatus("Test image selection cleared.");
  }

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
          provenanceReceipt: buildStyleDnaProvenanceReceipt({
            imageKind: "baseline",
            fileName: baselineFile.name,
          }),
        }),
      });
      return parseApiResponse<StyleDnaImageUploadResponse>(response);
    },
    onSuccess: (data) => {
      const id = data.image?.styleDnaImageId || "";
      if (id) {
        setBaselineGridImageId(id);
        setUploadedBaselinePreviewUrl(styleDnaImageContentPath(id));
      }
      setBaselineClipboardStatus(id ? `Upload succeeded: ${id}` : "Upload succeeded");
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
          stylizeTier: Number(activeBaselineStylizeTier),
          gridImageId: baselineGridImageId.trim(),
        }),
      });
      return parseApiResponse<Record<string, unknown>>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "baseline-set", baselineRenderSetId.trim()],
      });

      const currentIndex = baselinePromptDefinitions.findIndex((definition) => definition.promptKey === promptKey);
      if (currentIndex >= 0 && currentIndex < baselinePromptDefinitions.length - 1) {
        const nextPromptKey = baselinePromptDefinitions[currentIndex + 1]?.promptKey;
        if (nextPromptKey) {
          setPromptKey(nextPromptKey);
        }
      }
    },
  });

  const deleteBaselineItemMutation = useMutation({
    mutationFn: async (input: { promptKey: string; stylizeTier: number }) => {
      if (!baselineRenderSetId.trim()) {
        throw new Error("Baseline render set id is required");
      }
      const response = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(baselineRenderSetId.trim())}/items`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: input.promptKey,
          stylizeTier: input.stylizeTier,
        }),
      });
      return parseApiResponse<Record<string, unknown>>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "baseline-set", baselineRenderSetId.trim()],
      });
    },
  });

  const deleteBaselineSetMutation = useMutation({
    mutationFn: async () => {
      const selectedBaselineRenderSetId = baselineRenderSetId.trim();
      if (!selectedBaselineRenderSetId) {
        throw new Error("Baseline render set id is required");
      }
      const response = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(selectedBaselineRenderSetId)}`, {
        method: "DELETE",
      });
      return parseApiResponse<Record<string, unknown>>(response);
    },
    onSuccess: async () => {
      const deletedBaselineRenderSetId = baselineRenderSetId.trim();
      setBaselineRenderSetId("");
      setBaselineGridImageId("");
      setTestGridImageId("");
      setBaselineFile(null);
      setTestFile(null);
      setUploadedBaselinePreviewUrl("");
      setUploadedTestPreviewUrl("");
      setCopyStatus(deletedBaselineRenderSetId
        ? `Deleted baseline set ${deletedBaselineRenderSetId}.`
        : "Baseline set deleted.");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "baseline-sets"],
      });
      if (deletedBaselineRenderSetId) {
        await queryClient.invalidateQueries({
          queryKey: ["admin", "style-dna", "baseline-set", deletedBaselineRenderSetId],
        });
      }
    },
  });

  const uploadTestImageMutation = useMutation({
    mutationFn: async (input: { promptKey: string; cellId: string }) => {
      if (!testFile) {
        throw new Error("Choose a test grid file first");
      }
      if (!input.promptKey.trim()) {
        throw new Error("Prompt key is required for test upload");
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
          provenanceReceipt: buildStyleDnaProvenanceReceipt({
            imageKind: "test",
            fileName: testFile.name,
          }),
        }),
      });
      const data = await parseApiResponse<StyleDnaImageUploadResponse>(response);
      return {
        promptKey: input.promptKey,
        cellId: input.cellId,
        data,
      };
    },
    onSuccess: ({ promptKey: uploadedPromptKey, cellId: uploadedCellId, data }) => {
      const id = data.image?.styleDnaImageId || "";
      if (id) {
        setTestGridImageId(id);
        setUploadedTestPreviewUrl(styleDnaImageContentPath(id));
        const key = section3ProgressKey(uploadedPromptKey, uploadedCellId);
        setSection3PromptProgress((previous) => ({
          ...previous,
          [key]: {
            ...(previous[key] || {}),
            testGridImageId: id,
          },
        }));
      }
      setTestClipboardStatus(id ? `Upload succeeded: ${id}` : "Upload succeeded");
    },
  });

  const promptJobMutation = useMutation({
    mutationFn: async () => {
      if (!styleAdjustmentMidjourneyId.trim()) {
        throw new Error("Style adjustment Midjourney id is required");
      }
      if (baselinePromptDefinitions.length === 0) {
        throw new Error("Load a baseline set with prompt definitions first");
      }
      if (section3TestFamily === "profile_triplet" && styleAdjustmentType !== "profile") {
        throw new Error("Profile triplet family requires style adjustment type = profile");
      }
      if (section3TestFamily === "sref_matrix" && styleAdjustmentType !== "sref") {
        throw new Error("Sref matrix family requires style adjustment type = sref");
      }

      const prompts = baselinePromptDefinitions.flatMap((definition) => (
        section3TestCells.map((cell) => ({
          cellId: cell.cellId,
          promptKey: definition.promptKey,
          stylizeTier: cell.stylizeTier,
          promptTextGenerated: buildSection3PromptLine({
            promptText: definition.promptText,
            stylize: cell.stylizeTier,
            styleWeight: cell.styleWeight,
          }),
        }))
      ));
      const localPromptJobId = `local_${Date.now()}`;

      return {
        promptJob: {
          promptJobId: localPromptJobId,
        },
        promptJobId: localPromptJobId,
        prompts,
      } satisfies PromptJobResponse;
    },
    onSuccess: (data) => {
      const id = data.promptJob?.promptJobId || data.promptJobId || "";
      setLastPromptJobId(id);
      const firstPromptKey = data.prompts?.[0]?.promptKey;
      if (firstPromptKey) {
        setPromptKey(firstPromptKey);
      }
      const selectedTier = Number(stylizeTier);
      setSection3PromptProgress((previous) => {
        const next = { ...previous };
        for (const promptRow of data.prompts || []) {
          const promptKeyValue = String(promptRow.promptKey || "").trim();
          if (!promptKeyValue) {
            continue;
          }
          const promptTier = Number(promptRow.stylizeTier || 0);
          const explicitCellId = (promptRow as { cellId?: string }).cellId;
          const resolvedCell = explicitCellId
            ? section3TestCells.find((cell) => cell.cellId === explicitCellId)
            : section3TestCells.find((cell) => (
                cell.stylizeTier === promptTier
                && (
                  cell.styleWeight === undefined
                  || String(promptRow.promptTextGenerated || "").includes(`--sw ${cell.styleWeight}`)
                )
              ));
          if (!resolvedCell) {
            continue;
          }
          if (Number.isFinite(selectedTier) && promptTier !== selectedTier) {
            continue;
          }
          const key = section3ProgressKey(promptKeyValue, resolvedCell.cellId);
          next[key] = {
            ...(next[key] || {}),
            generatedPromptText: String(promptRow.promptTextGenerated || ""),
          };
        }
        return next;
      });
    },
  });

  const createStyleInfluenceMutation = useMutation({
    mutationFn: async () => {
      const influenceCode = styleAdjustmentMidjourneyId.trim();
      if (!influenceCode) {
        throw new Error("Enter a Style Adjustment Midjourney Id first");
      }
      const response = await fetch("/api/proxy/admin/style-influences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          influenceType: styleAdjustmentType,
          influenceCode,
        }),
      });
      return parseApiResponse<{ styleInfluence?: { styleInfluenceId?: string } }>(response);
    },
    onSuccess: async (data) => {
      const createdId = String(data.styleInfluence?.styleInfluenceId || "").trim();
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-influences"],
      });
      if (createdId) {
        setStyleInfluenceId(createdId);
      }
    },
  });

  const removeStyleInfluenceMutation = useMutation({
    mutationFn: async () => {
      const selectedId = styleInfluenceId.trim();
      if (!selectedId) {
        throw new Error("Select a Style Influence Id first");
      }
      const response = await fetch(`/api/proxy/admin/style-influences/${encodeURIComponent(selectedId)}/governance`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "remove",
          reason: "section3_type_correction",
        }),
      });
      return parseApiResponse<{ styleInfluence?: { styleInfluenceId?: string } }>(response);
    },
    onSuccess: async () => {
      const removedId = styleInfluenceId.trim();
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-influences"],
      });
      if (styleInfluenceId.trim() === removedId) {
        setStyleInfluenceId("");
      }
    },
  });

  const reviewTraitDiscoveryMutation = useMutation({
    mutationFn: async (input: {
      discoveryId: string;
      action: "approve_alias" | "create_canonical" | "reject" | "ignore";
      canonicalTraitId?: string;
      canonicalDisplayLabel?: string;
      note?: string;
    }) => {
      const response = await fetch(`/api/proxy/admin/style-dna/trait-discoveries/${encodeURIComponent(input.discoveryId)}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: input.action,
          canonicalTraitId: input.canonicalTraitId,
          canonicalDisplayLabel: input.canonicalDisplayLabel,
          note: input.note,
        }),
      });
      return parseApiResponse<{ discovery?: TraitDiscovery }>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "trait-discoveries", "pending_review"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "trait-discoveries", "history"],
      });
      if (styleInfluenceId.trim()) {
        await queryClient.invalidateQueries({
          queryKey: ["admin", "style-dna", "trait-summary", styleInfluenceId.trim()],
        });
      }
    },
  });

  const createCanonicalTraitMutation = useMutation({
    mutationFn: async () => {
      const label = canonicalCreateLabel.trim();
      if (!label) {
        throw new Error("Canonical display label is required");
      }
      const response = await fetch("/api/proxy/admin/style-dna/canonical-traits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          axis: canonicalAxisFilter,
          displayLabel: label,
          notes: canonicalCreateNote.trim() || undefined,
        }),
      });
      return parseApiResponse<CanonicalTraitMutationResponse>(response);
    },
    onSuccess: async (data) => {
      setCanonicalCreateLabel("");
      setCanonicalCreateNote("");
      const createdId = String(data.canonicalTrait?.canonicalTraitId || "").trim();
      if (createdId) {
        setSelectedCanonicalTraitId(createdId);
      }
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "canonical-traits"],
      });
    },
  });

  const updateCanonicalTraitStatusMutation = useMutation({
    mutationFn: async (input: { canonicalTraitId: string; status: "active" | "deprecated"; note?: string }) => {
      const response = await fetch(`/api/proxy/admin/style-dna/canonical-traits/${encodeURIComponent(input.canonicalTraitId)}/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: input.status,
          note: input.note,
        }),
      });
      return parseApiResponse<CanonicalTraitMutationResponse>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "canonical-traits"],
      });
    },
  });

  const createTraitAliasMutation = useMutation({
    mutationFn: async () => {
      const canonicalTraitId = selectedCanonicalTraitId.trim();
      const aliasText = aliasCreateText.trim();
      if (!canonicalTraitId) {
        throw new Error("Select a canonical trait first");
      }
      if (!aliasText) {
        throw new Error("Alias text is required");
      }
      const response = await fetch("/api/proxy/admin/style-dna/trait-aliases", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          axis: canonicalAxisFilter,
          canonicalTraitId,
          aliasText,
          note: aliasCreateNote.trim() || undefined,
        }),
      });
      return parseApiResponse<TraitAliasMutationResponse>(response);
    },
    onSuccess: async () => {
      setAliasCreateText("");
      setAliasCreateNote("");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "trait-aliases"],
      });
    },
  });
  const updateTraitAliasStatusMutation = useMutation({
    mutationFn: async (input: { aliasId: string; status: "active" | "deprecated"; note?: string }) => {
      const response = await fetch(`/api/proxy/admin/style-dna/trait-aliases/${encodeURIComponent(input.aliasId)}/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: input.status,
          note: input.note,
        }),
      });
      return parseApiResponse<{ traitAlias?: TraitAlias; changed?: boolean }>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "trait-aliases"],
      });
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
          stylizeTier: Number(selectedSection3Cell?.stylizeTier || stylizeTier),
          testGridImageId: selectedSection3PromptTestImageId.trim(),
          submittedTestEnvelope: {
            mjModelFamily: mjModelFamily.trim(),
            mjModelVersion: mjModelVersion.trim(),
            seed: seed.trim(),
            quality: quality.trim(),
            aspectRatio: aspectRatio.trim(),
            styleRaw: loadedEnvelope?.styleRaw === undefined ? null : Boolean(loadedEnvelope.styleRaw),
            stylizeTier: Number(selectedSection3Cell?.stylizeTier || stylizeTier),
            styleWeight: styleAdjustmentType === "sref" ? Number(selectedSection3Cell?.styleWeight) : null,
          },
        }),
      });
      return parseApiResponse<StyleDnaRunSubmitResponse>(response);
    },
    onSuccess: (data) => {
      const runId = data.run?.styleDnaRunId || data.styleDnaRunId || "";
      setLastStyleDnaRunId(runId);
      if (promptKey.trim() && selectedSection3Cell) {
        const key = section3ProgressKey(promptKey.trim(), selectedSection3Cell.cellId);
        setSection3PromptProgress((previous) => ({
          ...previous,
          [key]: {
            ...(previous[key] || {}),
            runId,
            runStatus: "queued",
          },
        }));
      }
      void queryClient.invalidateQueries({
        queryKey: ["admin", "style-dna", "trait-summary", styleInfluenceId.trim()],
      });
    },
  });

  const lookupRunMutation = useMutation({
    mutationFn: async () => {
      const runId = selectedPromptRunId || lastStyleDnaRunId.trim();
      if (!runId) {
        throw new Error("Enter or create a style-dna run id first");
      }
      const response = await fetch(`/api/proxy/admin/style-dna/runs/${encodeURIComponent(runId)}`, {
        method: "GET",
        cache: "no-store",
      });
      return parseApiResponse<StyleDnaRunLookupResponse>(response);
    },
    onSuccess: (data) => {
      const run = data.run;
      const resolvedPromptKey = String(run?.promptKey || "").trim() || promptKey.trim();
      const resolvedRunId = String(run?.styleDnaRunId || "").trim();
      if (!resolvedPromptKey || !selectedSection3Cell) {
        return;
      }
      const key = section3ProgressKey(resolvedPromptKey, selectedSection3Cell.cellId);
      setSection3PromptProgress((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] || {}),
          runId: resolvedRunId || previous[key]?.runId,
          runStatus: String(run?.status || previous[key]?.runStatus || ""),
          result: data.result || previous[key]?.result,
        },
      }));
      if (String(run?.status || "") === "succeeded" && styleInfluenceId.trim() !== "") {
        void queryClient.invalidateQueries({
          queryKey: ["admin", "style-dna", "trait-summary", styleInfluenceId.trim()],
        });
      }
    },
  });

  const clearOpenAiDebugLogMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/debug/openai/clear", {
        method: "POST",
      });
      return parseApiResponse<{ cleared?: boolean }>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "debug", "openai"],
      });
    },
  });

  const availableInfluences = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const influence of styleInfluenceListQuery.data?.styleInfluences || []) {
      const styleInfluenceId = String(influence.styleInfluenceId || "").trim();
      if (!styleInfluenceId || map.has(styleInfluenceId)) {
        continue;
      }
      const typeLabel = String(influence.typeKey || "unknown");
      const influenceCode = String(influence.influenceCode || "");
      map.set(styleInfluenceId, {
        id: styleInfluenceId,
        label: `${styleInfluenceId} (${typeLabel}: ${influenceCode})`,
      });
    }
    return Array.from(map.values());
  }, [styleInfluenceListQuery.data]);

  const authStateLabel = useMemo(() => {
    if (sessionStateQuery.isLoading) {
      return "loading";
    }
    if (sessionStateQuery.isError) {
      return "error";
    }
    return sessionStateQuery.data?.authenticated ? "authenticated" : "unauthenticated";
  }, [sessionStateQuery.data, sessionStateQuery.isError, sessionStateQuery.isLoading]);

  const baselinePreviewUrl = baselineFilePreviewUrl || uploadedBaselinePreviewUrl;
  const testPreviewUrl = testFilePreviewUrl || uploadedTestPreviewUrl;
  const baselineStyleWeight = baselineEnvelope?.styleWeight !== undefined
    ? Number(baselineEnvelope.styleWeight)
    : Number.NaN;
  const loadedBaselineSet = baselineSetDetailQuery.data?.baselineRenderSet;
  const loadedEnvelope = loadedBaselineSet?.parameterEnvelope;
  const selectedSection3Cell = section3TestCells.find((cell) => cell.cellId === selectedSection3CellId) || null;
  const section3Rows = useMemo(() => baselinePromptDefinitions.flatMap((definition) => (
    section3TestCells.map((cell) => {
      const baselineItem = baselineItems.find((item) => (
        item.promptKey === definition.promptKey
        && Number(item.stylizeTier || 0) === Number(cell.stylizeTier)
      ));
      const progressKey = section3ProgressKey(definition.promptKey, cell.cellId);
      const progress = section3PromptProgress[progressKey] || {};
      const copied = Boolean(progress.copied);
      const uploaded = Boolean(progress.testGridImageId);
      return {
        definition,
        cell,
        copied,
        uploaded,
        complete: copied && uploaded,
        generatedPromptText: progress.generatedPromptText || "",
        testGridImageId: progress.testGridImageId || "",
        runId: progress.runId || "",
        runStatus: progress.runStatus || "",
        result: progress.result,
        baselineGridImageId: baselineItem?.gridImageId || "",
      };
    })
  )), [baselineItems, baselinePromptDefinitions, section3PromptProgress, section3TestCells]);
  const selectedSection3Row = section3Rows.find((row) => (
    row.definition.promptKey === promptKey && row.cell.cellId === selectedSection3CellId
  )) || null;
  const selectedSection3PromptTestImageId = selectedSection3Row?.testGridImageId || testGridImageId.trim();
  const selectedPromptRunId = String(selectedSection3Row?.runId || "").trim();
  const section3PendingRows = section3Rows.filter((row) => !row.complete);
  const section3CompleteRows = section3Rows.filter((row) => row.complete);
  const section3BaselinePreviewUrl = selectedSection3Row?.baselineGridImageId
    ? styleDnaImageContentPath(selectedSection3Row.baselineGridImageId)
    : "";
  const section3TestPreviewUrl = testPreviewUrl || (
    selectedSection3Row?.testGridImageId ? styleDnaImageContentPath(selectedSection3Row.testGridImageId) : ""
  );
  const styleInfluenceTraitSummary = styleInfluenceTraitSummaryQuery.data?.summary;
  const pendingTraitDiscoveries = useMemo(() => (
    [...(traitDiscoveriesQuery.data?.discoveries || [])]
      .sort((a, b) => Number(b.seenCount || 0) - Number(a.seenCount || 0))
  ), [traitDiscoveriesQuery.data?.discoveries]);
  const reviewHistoryDiscoveries = useMemo(() => (
    [...(traitDiscoveryHistoryQuery.data?.discoveries || [])]
      .sort((a, b) => (
        String(b.resolutionPayload?.reviewedAt || b.lastSeenAt || "").localeCompare(String(a.resolutionPayload?.reviewedAt || a.lastSeenAt || ""))
      ))
  ), [traitDiscoveryHistoryQuery.data?.discoveries]);
  const canonicalTraits = useMemo(() => (
    [...(canonicalTraitsQuery.data?.canonicalTraits || [])]
      .sort((a, b) => String(a.displayLabel || "").localeCompare(String(b.displayLabel || "")))
  ), [canonicalTraitsQuery.data?.canonicalTraits]);
  const selectedCanonicalTrait = canonicalTraits.find(
    (item) => String(item.canonicalTraitId || "") === selectedCanonicalTraitId
  ) || null;
  const axisTraitAliases = useMemo(() => (
    [...(traitAliasesQuery.data?.traitAliases || [])]
      .sort((a, b) => String(a.aliasText || "").localeCompare(String(b.aliasText || "")))
  ), [traitAliasesQuery.data?.traitAliases]);
  const selectedCanonicalTraitAliases = useMemo(() => (
    axisTraitAliases.filter((alias) => String(alias.canonicalTraitId || "") === selectedCanonicalTraitId)
  ), [axisTraitAliases, selectedCanonicalTraitId]);
  useEffect(() => {
    if (canonicalTraits.length === 0) {
      if (selectedCanonicalTraitId !== "") {
        setSelectedCanonicalTraitId("");
      }
      return;
    }
    const exists = canonicalTraits.some((item) => String(item.canonicalTraitId || "") === selectedCanonicalTraitId);
    if (!exists) {
      setSelectedCanonicalTraitId(String(canonicalTraits[0].canonicalTraitId || ""));
    }
  }, [canonicalTraits, selectedCanonicalTraitId]);

  const createBaselineBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!mjModelFamily.trim()) {
      reasons.push("Model family is required.");
    }
    if (!mjModelVersion.trim()) {
      reasons.push("Model version is required.");
    }
    if (!suiteId.trim()) {
      reasons.push("Baseline prompt suite id is required.");
    }
    if (!aspectRatio.trim()) {
      reasons.push("Aspect ratio is required.");
    }
    if (!stylizeTier.trim()) {
      reasons.push("Stylize tier is required.");
    }
    if (!Number.isFinite(Number(stylizeTier))) {
      reasons.push("Stylize tier must be numeric.");
    }
    if (!Number.isFinite(Number(quality))) {
      reasons.push("Quality must be numeric.");
    }
    return reasons;
  }, [aspectRatio, mjModelFamily, mjModelVersion, quality, stylizeTier, suiteId]);
  const createBaselineBlocker = createBaselineBlockingReasons[0] || "";

  const attachBaselineBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!baselineRenderSetId.trim()) {
      reasons.push("Baseline render set id is required.");
    }
    if (!loadedBaselineSet) {
      reasons.push("Load baseline set details first.");
    }
    if (!promptKey.trim()) {
      reasons.push("Prompt key is required.");
    }
    if (!baselinePromptDefinitions.some((item) => item.promptKey === promptKey.trim())) {
      reasons.push("Selected prompt key must exist in the loaded prompt suite.");
    }
    if (!baselineGridImageId.trim()) {
      reasons.push("Upload a baseline grid image first.");
    }
    return reasons;
  }, [baselineGridImageId, baselinePromptDefinitions, baselineRenderSetId, loadedBaselineSet, promptKey]);
  const attachBaselineBlocker = attachBaselineBlockingReasons[0] || "";

  const generatePromptBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!styleInfluenceId.trim()) {
      reasons.push("Style influence id is required.");
    }
    if (!baselineRenderSetId.trim()) {
      reasons.push("Baseline render set id is required.");
    }
    if (!loadedBaselineSet) {
      reasons.push("Load baseline set details first.");
    }
    if (!hasPromptDefinitions) {
      reasons.push("Loaded baseline set has no prompt definitions.");
    }
    if (!styleAdjustmentMidjourneyId.trim()) {
      reasons.push("Style adjustment Midjourney id is required.");
    }
    return reasons;
  }, [
    baselineRenderSetId,
    hasPromptDefinitions,
    loadedBaselineSet,
    styleAdjustmentMidjourneyId,
    styleInfluenceId,
  ]);
  const generatePromptBlocker = generatePromptBlockingReasons[0] || "";

  const submitRunBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    const runStylizeTier = Number(selectedSection3Cell?.stylizeTier ?? stylizeTier);
    const loadedStylizeTier = loadedEnvelope?.stylizeTier !== undefined
      ? Number(loadedEnvelope.stylizeTier)
      : Number.NaN;
    const promptDefinitionExists = baselinePromptDefinitions.some((definition) => definition.promptKey === promptKey.trim());
    const baselineCoverageForPromptAndTier = baselineItems.some((item) => (
      item.promptKey === promptKey.trim() && Number(item.stylizeTier || 0) === runStylizeTier
    ));

    if (!styleInfluenceId.trim()) {
      reasons.push("Style influence id is required.");
    }
    if (!baselineRenderSetId.trim()) {
      reasons.push("Baseline render set id is required.");
    }
    if (!loadedBaselineSet) {
      reasons.push("Loaded baseline set details are required.");
    }
    if (!promptKey.trim()) {
      reasons.push("Prompt key is required.");
    }
    if (!selectedSection3Cell) {
      reasons.push("Select a test cell before submitting.");
    }
    if (!promptDefinitionExists) {
      reasons.push("Selected prompt key is not part of the loaded baseline prompt suite.");
    }
    if (!Number.isFinite(runStylizeTier)) {
      reasons.push("Stylize tier must be a valid number.");
    }
    if (Number.isFinite(loadedStylizeTier) && Number.isFinite(runStylizeTier) && runStylizeTier !== loadedStylizeTier) {
      reasons.push(`Run stylize tier (${runStylizeTier}) must match loaded baseline stylize tier (${loadedStylizeTier}).`);
    }
    if (Number.isFinite(runStylizeTier) && !baselineCoverageForPromptAndTier) {
      reasons.push(`Baseline coverage is missing for prompt ${promptKey.trim() || "(none)"} at stylize ${runStylizeTier}.`);
    }
    if (!styleAdjustmentMidjourneyId.trim()) {
      reasons.push("Style adjustment Midjourney id is required.");
    }
    if (!selectedSection3PromptTestImageId.trim()) {
      reasons.push("Upload a test grid image for the selected prompt first.");
    }
    if (styleAdjustmentType === "sref" && !Number.isFinite(Number(selectedSection3Cell?.styleWeight))) {
      reasons.push("sref runs require a valid test styleWeight in the selected cell.");
    }
    if (styleAdjustmentType === "sref" && !Number.isFinite(baselineStyleWeight)) {
      reasons.push("sref runs require a baseline set with explicit styleWeight=0 control envelope.");
    }
    if (styleAdjustmentType === "sref" && Number.isFinite(baselineStyleWeight) && baselineStyleWeight !== 0) {
      reasons.push("sref runs require a control baseline with styleWeight=0.");
    }

    // Guardrail: if section-1 fields drift from loaded baseline set, operator intent is ambiguous.
    if (
      loadedBaselineSet
      && (
        String(loadedBaselineSet.mjModelFamily || "").trim() !== mjModelFamily.trim()
        || String(loadedBaselineSet.mjModelVersion || "").trim() !== mjModelVersion.trim()
        || String(loadedBaselineSet.suiteId || "").trim() !== suiteId.trim()
        || String(loadedEnvelope?.seed ?? "").trim() !== seed.trim()
        || String(loadedEnvelope?.quality ?? "").trim() !== quality.trim()
        || String(loadedEnvelope?.aspectRatio || "").trim() !== aspectRatio.trim()
      )
    ) {
      reasons.push("Section 1 fields do not match the loaded baseline set envelope. Save as a new baseline set or reload before submit.");
    }

    return reasons;
  }, [
    aspectRatio,
    baselineItems,
    baselineRenderSetId,
    baselineStyleWeight,
    baselinePromptDefinitions,
    loadedBaselineSet,
    loadedEnvelope?.aspectRatio,
    loadedEnvelope?.quality,
    loadedEnvelope?.seed,
    loadedEnvelope?.stylizeTier,
    mjModelFamily,
    mjModelVersion,
    promptKey,
    quality,
    seed,
    styleAdjustmentMidjourneyId,
    styleAdjustmentType,
    styleInfluenceId,
    stylizeTier,
    selectedSection3Cell,
    suiteId,
    testGridImageId,
    selectedSection3PromptTestImageId,
  ]);
  const submitRunBlocker = submitRunBlockingReasons[0] || "";

  const lookupRunBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!selectedPromptRunId && !lastStyleDnaRunId.trim()) {
      reasons.push("Enter a Style-DNA run id first.");
    }
    if (styleDnaProbeQuery.data?.ready === false) {
      reasons.push("Style-DNA admin endpoints are not available.");
    }
    return reasons;
  }, [lastStyleDnaRunId, selectedPromptRunId, styleDnaProbeQuery.data?.ready]);
  const lookupRunBlocker = lookupRunBlockingReasons[0] || "";
  const workflowReadiness = useMemo(() => ([
    {
      label: "Baseline Set",
      ready: Boolean(loadedBaselineSet),
      detail: loadedBaselineSet ? "Loaded" : "Not loaded",
    },
    {
      label: "Baseline Coverage",
      ready: hasPromptDefinitions && missingPromptRows.length === 0,
      detail: hasPromptDefinitions
        ? `${uploadedPromptRows.length}/${requiredPromptRows.length} prompts attached`
        : "No prompt definitions",
    },
    {
      label: "Prompt Generation",
      ready: generatePromptBlockingReasons.length === 0,
      detail: generatePromptBlockingReasons.length === 0 ? "Ready" : `${generatePromptBlockingReasons.length} prerequisite(s)`,
    },
    {
      label: "Run Submission",
      ready: submitRunBlockingReasons.length === 0,
      detail: submitRunBlockingReasons.length === 0 ? "Ready" : `${submitRunBlockingReasons.length} guardrail(s)`,
    },
  ]), [
    generatePromptBlockingReasons.length,
    hasPromptDefinitions,
    loadedBaselineSet,
    missingPromptRows.length,
    requiredPromptRows.length,
    submitRunBlockingReasons.length,
    uploadedPromptRows.length,
  ]);

  const section3MatrixPreviewRows = useMemo(() => baselinePromptDefinitions.map((definition) => ({
    promptKey: definition.promptKey,
    promptText: definition.promptText,
    cells: section3TestCells.map((cell) => ({
      cellId: cell.cellId,
      label: cell.label,
      prompt: buildSection3PromptLine({
        promptText: definition.promptText,
        stylize: cell.stylizeTier,
        styleWeight: cell.styleWeight,
      }),
    })),
  })), [baselinePromptDefinitions, section3TestCells, baselineEnvelope?.aspectRatio, baselineEnvelope?.quality, baselineEnvelope?.seed, baselineEnvelope?.styleRaw, baselineModelVersion, styleAdjustmentMidjourneyId, styleAdjustmentType]);

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
        <h2 className="text-lg font-semibold text-[var(--ink)]">Workflow Readiness</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Operator snapshot for baseline setup, prompt generation, and run-submit readiness.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {workflowReadiness.map((item) => (
            <div key={item.label} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {item.ready ? "ready" : "blocked"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">1) Baseline Test Definition</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Create a new immutable baseline set or load an existing baseline set as an editable draft.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Model Family</span>
            <input value={mjModelFamily} onChange={(event) => setMjModelFamily(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Model Version</span>
            <input value={mjModelVersion} onChange={(event) => setMjModelVersion(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Baseline Prompt Suite Id</span>
            <input value={suiteId} onChange={(event) => setSuiteId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Stylize Tier</span>
            <select value={stylizeTier} onChange={(event) => setStylizeTier(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              <option value="0">0</option>
              <option value="100">100</option>
              <option value="1000">1000</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Seed</span>
            <input value={seed} onChange={(event) => setSeed(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Quality</span>
            <input value={quality} onChange={(event) => setQuality(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Aspect Ratio</span>
            <input value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => createBaselineMutation.mutate()}
            disabled={createBaselineMutation.isPending || createBaselineBlocker !== ""}
            title={createBaselineBlocker || undefined}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {createBaselineMutation.isPending ? "Saving..." : "Save As New Baseline Set"}
          </button>
          <button
            type="button"
            onClick={() => {
              const selectedBaselineRenderSetId = baselineRenderSetId.trim();
              if (!selectedBaselineRenderSetId) {
                return;
              }
              const confirmed = window.confirm(
                `Delete baseline set ${selectedBaselineRenderSetId} and all related prompt jobs, runs, results, and images?`
              );
              if (!confirmed) {
                return;
              }
              deleteBaselineSetMutation.mutate();
            }}
            disabled={deleteBaselineSetMutation.isPending || baselineRenderSetId.trim() === ""}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
          >
            {deleteBaselineSetMutation.isPending ? "Deleting..." : "Delete Baseline Set"}
          </button>
          <label className="flex min-w-[280px] flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Baseline Render Set Id</span>
            <input value={baselineRenderSetId} onChange={(event) => setBaselineRenderSetId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
        </div>
        {styleDnaProbeQuery.isError ? (
          <p className="mt-2 text-sm text-red-600">
            Style-DNA API probe failed. Ensure API is running and reachable at `/v1/admin/style-dna/*`.
          </p>
        ) : null}
        {styleDnaProbeQuery.data && styleDnaProbeQuery.data.ready === false ? (
          <p className="mt-2 text-sm text-red-600">
            Style-DNA admin endpoints are not available (404). Verify backend version and route registration.
          </p>
        ) : null}
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Load Existing Baseline Set</span>
          <select
            value={baselineRenderSetId}
            onChange={(event) => setBaselineRenderSetId(event.target.value)}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="">Select baseline render set</option>
            {(baselineSetListQuery.data?.baselineSets || []).map((set) => (
              <option key={set.baselineRenderSetId} value={set.baselineRenderSetId}>
                {set.baselineRenderSetId} | {set.suiteId} | {set.mjModelFamily} {set.mjModelVersion} | s {set.parameterEnvelope?.stylizeTier ?? "-"}
              </option>
            ))}
          </select>
        </label>
        {baselineSetListQuery.isError ? (
          <p className="mt-2 text-sm text-red-600">
            Could not load baseline sets. Verify you are authenticated as admin and backend is running.
          </p>
        ) : null}
        {baselineSetListQuery.data && (baselineSetListQuery.data.baselineSets || []).length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No baseline render sets found. Create one in section 1 first.
          </p>
        ) : null}
        {createBaselineBlockingReasons.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Save is disabled:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {createBaselineBlockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {createBaselineMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Save failed: {mutationErrorMessage(createBaselineMutation.error)}</p>
        ) : null}
        {deleteBaselineSetMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Delete failed: {mutationErrorMessage(deleteBaselineSetMutation.error)}</p>
        ) : null}
        {baselineRenderSetId.trim() ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Loaded sets are immutable baseline references. Editing section 1 values and saving creates a new baseline set id.
          </p>
        ) : null}
        {baselineSetDetailQuery.data?.promptDefinitions?.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Prompt Key</th>
                  <th className="px-3 py-2 font-medium">Prompt</th>
                  <th className="px-3 py-2 font-medium">Domain</th>
                  <th className="px-3 py-2 font-medium">What It Tests</th>
                </tr>
              </thead>
              <tbody>
                {baselineSetDetailQuery.data.promptDefinitions.map((item) => (
                  <tr key={item.promptKey} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">{item.promptKey}</td>
                    <td className="px-3 py-2">{item.promptText}</td>
                    <td className="px-3 py-2">{item.domain || "-"}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{item.whatItTests || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">2) Baseline Grid Capture</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Select a prompt from this baseline set and upload the baseline grid for the set&apos;s stylize tier.
        </p>
        {!baselineRenderSetId.trim() ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Select or enter a baseline render set id above to load suite prompts.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm">
          <p>
            <span className="font-medium">Suite:</span>{" "}
            {baselineSetDetailQuery.data?.baselinePromptSuite?.name
              ? `${baselineSetDetailQuery.data.baselinePromptSuite.name} (${baselineSetDetailQuery.data.baselinePromptSuite.suiteId || ""})`
              : baselineSetDetailQuery.data?.baselineRenderSet?.suiteId || "-"}
          </p>
          <p><span className="font-medium">Stylize Tier:</span> {Number.isFinite(activeBaselineStylizeTier) ? activeBaselineStylizeTier : "-"}</p>
          <p><span className="font-medium">Model Version:</span> {baselineModelVersion || "-"}</p>
          <p><span className="font-medium">Seed:</span> {baselineEnvelope?.seed ?? "-"}</p>
          <p><span className="font-medium">Aspect Ratio:</span> {baselineEnvelope?.aspectRatio || "-"}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Prompt</span>
            <select value={promptKey} onChange={(event) => setPromptKey(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              {baselinePromptDefinitions.length === 0 ? <option value="">No prompts loaded</option> : null}
              {baselinePromptDefinitions.map((item) => (
                <option key={item.promptKey} value={item.promptKey}>
                  {item.promptKey} - {item.promptText}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Uploaded Baseline Image Id</span>
            <input value={baselineGridImageId} onChange={(event) => setBaselineGridImageId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <div
            className="md:col-span-2 rounded-lg border border-[var(--line)] p-3"
            tabIndex={0}
            onPaste={handleBaselinePasteEvent}
            title="Focus this panel and press Cmd/Ctrl+V to paste an image grid"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Baseline Grid File</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBaselineFile(event.target.files?.[0] || null)} className="text-sm" />
            </label>
            <p className="mt-2 text-xs text-[var(--muted)]">Tip: click this panel then press Cmd/Ctrl+V to paste from clipboard.</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => pasteBaselineImageFromClipboard()}
            className="rounded-lg border border-[var(--line)] px-3 py-1"
          >
            Paste Baseline Grid
          </button>
          <button
            type="button"
            onClick={() => clearBaselineImageSelection()}
            className="rounded-lg border border-[var(--line)] px-3 py-1"
          >
            Clear Baseline Grid
          </button>
          {baselineFile ? <p className="text-[var(--muted)]">Selected: {baselineFile.name}</p> : null}
          {baselineClipboardStatus ? <p className="text-[var(--muted)]">{baselineClipboardStatus}</p> : null}
        </div>
        {(baselinePreviewUrl || baselineGridImageId) ? (
          <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-[var(--line)] p-3">
            {baselinePreviewUrl ? (
              <img
                src={baselinePreviewUrl}
                alt="Baseline grid preview"
                className="h-24 w-24 rounded border border-[var(--line)] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--muted)]">
                no preview
              </div>
            )}
            <div className="text-sm">
              <p><span className="font-medium">Baseline Image Id:</span> {baselineGridImageId || "(not uploaded yet)"}</p>
              <p className="text-[var(--muted)]">Preview remains visible after upload for confirmation.</p>
            </div>
          </div>
        ) : null}
        {selectedPromptDefinition ? (
          <div className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p><span className="font-medium">Domain:</span> {selectedPromptDefinition.domain || "-"}</p>
            <p><span className="font-medium">What It Tests:</span> {selectedPromptDefinition.whatItTests || "-"}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Baseline Prompt To Copy</p>
              <button
                type="button"
                onClick={() => copySelectedPromptLine()}
                className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs"
              >
                Copy Prompt
              </button>
            </div>
            <p className="mt-1 rounded bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs text-[var(--ink)]">
              {selectedPromptLine}
            </p>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => uploadBaselineImageMutation.mutate()}
            disabled={uploadBaselineImageMutation.isPending || !baselineFile}
            title={baselineFile ? undefined : "Choose or paste a baseline grid file first."}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            {uploadBaselineImageMutation.isPending ? "Uploading..." : "Upload Baseline Grid"}
          </button>
          <button
            type="button"
            onClick={() => attachBaselineItemMutation.mutate()}
            disabled={attachBaselineItemMutation.isPending || attachBaselineBlocker !== ""}
            title={attachBaselineBlocker || undefined}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {attachBaselineItemMutation.isPending ? "Saving..." : "Attach Baseline Grid to Set"}
          </button>
        </div>
        {!baselineFile ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Upload requires a selected baseline file.</p>
        ) : null}
        {attachBaselineBlockingReasons.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Attach is disabled:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {attachBaselineBlockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {uploadBaselineImageMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Baseline upload failed: {mutationErrorMessage(uploadBaselineImageMutation.error)}</p>
        ) : null}
        {attachBaselineItemMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Baseline attach failed: {mutationErrorMessage(attachBaselineItemMutation.error)}</p>
        ) : null}
        {deleteBaselineItemMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Baseline delete failed: {mutationErrorMessage(deleteBaselineItemMutation.error)}</p>
        ) : null}
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              Remaining Baseline Prompts ({missingPromptRows.length})
            </p>
            <button type="button" onClick={() => copyMissingBaselinePrompts()} className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs">
              Copy Remaining Prompts
            </button>
          </div>
          {copyStatus ? <p className="mt-2 text-xs text-[var(--muted)]">{copyStatus}</p> : null}
          {!hasPromptDefinitions ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No prompt definitions are loaded for this baseline set.</p>
          ) : missingPromptRows.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Baseline set coverage is complete for stylize {activeBaselineStylizeTier}.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {missingPromptRows.map(({ definition }) => (
                <li
                  key={definition.promptKey}
                  className={`rounded border p-2 ${copiedRemainingPromptKeys[definition.promptKey]
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-[var(--line)]"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-[var(--muted)]">{definition.promptKey}</p>
                      <p>{definition.promptText}</p>
                      <p className="text-xs text-[var(--muted)]">{definition.domain || "Unspecified domain"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyRemainingPromptLine(definition.promptKey)}
                      className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs"
                    >
                      Copy Prompt
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <p className="text-sm font-medium text-[var(--ink)]">
            Uploaded Prompts ({uploadedPromptRows.length})
          </p>
          {uploadedPromptRows.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No baseline grids attached yet for this stylize tier.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {uploadedPromptRows.map(({ definition, attachedGridImageId }) => (
                <li key={definition.promptKey} className="rounded border border-[var(--line)] p-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {brokenUploadedThumbnailIds[attachedGridImageId] ? (
                        <div className="flex h-16 w-16 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--muted)]">
                          no preview
                        </div>
                      ) : (
                        <img
                          src={styleDnaImageContentPath(attachedGridImageId)}
                          alt={`${definition.promptKey} baseline thumbnail`}
                          className="h-16 w-16 rounded border border-[var(--line)] object-cover"
                          onError={() => setBrokenUploadedThumbnailIds((previous) => ({
                            ...previous,
                            [attachedGridImageId]: true,
                          }))}
                        />
                      )}
                      <div>
                        <p className="font-mono text-xs text-[var(--muted)]">{definition.promptKey}</p>
                        <p>{definition.promptText}</p>
                        <p className="text-xs text-[var(--muted)]">Image Id: {attachedGridImageId}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Delete uploaded baseline for ${definition.promptKey} at stylize ${Number(activeBaselineStylizeTier || 0)}?`
                        );
                        if (!confirmed) {
                          return;
                        }
                        deleteBaselineItemMutation.mutate({
                          promptKey: definition.promptKey,
                          stylizeTier: Number(activeBaselineStylizeTier || 0),
                        });
                      }}
                      disabled={deleteBaselineItemMutation.isPending}
                      className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs"
                    >
                      {deleteBaselineItemMutation.isPending ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">3) Style Adjustment Comparison</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Select influence + adjustment, upload test grid, then submit and track the run.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Style Adjustment Type</span>
            <select
              value={styleAdjustmentType}
              onChange={(event) => {
                const nextType = event.target.value as "sref" | "profile";
                setStyleAdjustmentType(nextType);
                const nextFamily = nextType === "profile" ? "profile_triplet" : "sref_matrix";
                setSection3TestFamily(nextFamily);
                setSelectedSection3CellId(nextFamily === "profile_triplet" ? "profile_s0" : "sref_s0_sw0");
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              <option value="sref">sref</option>
              <option value="profile">profile</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Test Family</span>
            <select
              value={section3TestFamily}
              onChange={(event) => {
                const nextFamily = event.target.value as Section3TestFamily;
                setSection3TestFamily(nextFamily);
                setSelectedSection3CellId(nextFamily === "profile_triplet" ? "profile_s0" : "sref_s0_sw0");
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              <option value="profile_triplet">Profile Triplet (`--s 0,100,1000`)</option>
              <option value="sref_matrix">Sref Matrix (`--s/--sw combinations`)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Test Cell</span>
            <select
              value={selectedSection3CellId}
              onChange={(event) => setSelectedSection3CellId(event.target.value)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              {section3TestCells.map((cell) => (
                <option key={cell.cellId} value={cell.cellId}>
                  {cell.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Style Adjustment Midjourney Id</span>
            <input value={styleAdjustmentMidjourneyId} onChange={(event) => setStyleAdjustmentMidjourneyId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => createStyleInfluenceMutation.mutate()}
                disabled={createStyleInfluenceMutation.isPending || !styleAdjustmentMidjourneyId.trim()}
                title={styleAdjustmentMidjourneyId.trim() ? undefined : "Enter a Midjourney id first."}
                className="w-fit rounded-lg border border-[var(--line)] px-3 py-1 text-xs disabled:opacity-60"
              >
                {createStyleInfluenceMutation.isPending ? "Creating..." : "Create New"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!styleInfluenceId.trim()) {
                    return;
                  }
                  const confirmed = window.confirm(
                    `Remove style influence ${styleInfluenceId.trim()}? This marks it removed and it will disappear from active list.`
                  );
                  if (!confirmed) {
                    return;
                  }
                  removeStyleInfluenceMutation.mutate();
                }}
                disabled={removeStyleInfluenceMutation.isPending || !styleInfluenceId.trim()}
                title={styleInfluenceId.trim() ? undefined : "Select a Style Influence Id first."}
                className="w-fit rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-60"
              >
                {removeStyleInfluenceMutation.isPending ? "Removing..." : "Remove Selected"}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Style Influence Id</span>
            <select value={styleInfluenceId} onChange={(event) => setStyleInfluenceId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              <option value="">Select style influence</option>
              {availableInfluences.map((influence) => (
                <option key={influence.id} value={influence.id}>{influence.label}</option>
              ))}
            </select>
            {styleInfluenceListQuery.isLoading ? (
              <p className="text-xs text-[var(--muted)]">Loading style influences...</p>
            ) : null}
            {styleInfluenceListQuery.isError ? (
              <p className="text-xs text-red-600">Could not load style influences.</p>
            ) : null}
            {!styleInfluenceListQuery.isLoading && !styleInfluenceListQuery.isError && availableInfluences.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No style influences yet. Enter a Midjourney id and click Create New.</p>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Test Grid Image Id</span>
            <input value={selectedSection3PromptTestImageId} onChange={(event) => setTestGridImageId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Style-DNA Run Id</span>
            <input value={lastStyleDnaRunId} onChange={(event) => setLastStyleDnaRunId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <div
            className="md:col-span-2 rounded-lg border border-[var(--line)] p-3"
            tabIndex={0}
            onPaste={handleTestPasteEvent}
            title="Focus this panel and press Cmd/Ctrl+V to paste an image grid"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Test Grid File</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setTestFile(event.target.files?.[0] || null)} className="text-sm" />
            </label>
            <p className="mt-2 text-xs text-[var(--muted)]">Tip: click this panel then press Cmd/Ctrl+V to paste from clipboard.</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => pasteTestImageFromClipboard()}
            className="rounded-lg border border-[var(--line)] px-3 py-1"
          >
            Paste Test Grid
          </button>
          <button
            type="button"
            onClick={() => clearTestImageSelection()}
            className="rounded-lg border border-[var(--line)] px-3 py-1"
          >
            Clear Test Grid
          </button>
          {testFile ? <p className="text-[var(--muted)]">Selected: {testFile.name}</p> : null}
          {testClipboardStatus ? <p className="text-[var(--muted)]">{testClipboardStatus}</p> : null}
        </div>
        {(section3BaselinePreviewUrl || section3TestPreviewUrl || selectedSection3PromptTestImageId) ? (
          <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-[var(--line)] p-3">
            {section3BaselinePreviewUrl ? (
              <img
                src={section3BaselinePreviewUrl}
                alt="Baseline comparison preview"
                className="h-24 w-24 rounded border border-[var(--line)] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--muted)]">
                no baseline
              </div>
            )}
            {section3TestPreviewUrl ? (
              <img
                src={section3TestPreviewUrl}
                alt="Test grid preview"
                className="h-24 w-24 rounded border border-[var(--line)] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--muted)]">
                no preview
              </div>
            )}
            <div className="text-sm">
              <p><span className="font-medium">Prompt:</span> {promptKey || "(none)"}</p>
              <p><span className="font-medium">Cell:</span> {selectedSection3Row?.cell.label || selectedSection3Cell?.label || "(none)"}</p>
              <p><span className="font-medium">Baseline Image Id:</span> {selectedSection3Row?.baselineGridImageId || "(missing baseline coverage)"}</p>
              <p><span className="font-medium">Test Image Id:</span> {selectedSection3PromptTestImageId || "(not uploaded yet)"}</p>
              <p className="text-[var(--muted)]">Use this to confirm the intended grid is selected/uploaded.</p>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => promptJobMutation.mutate()}
            disabled={promptJobMutation.isPending || generatePromptBlocker !== ""}
            title={generatePromptBlocker || undefined}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            {promptJobMutation.isPending ? "Generating..." : "Generate Prompt"}
          </button>
          <button
            type="button"
            onClick={() => uploadTestImageMutation.mutate({ promptKey: promptKey.trim(), cellId: selectedSection3CellId })}
            disabled={uploadTestImageMutation.isPending || !testFile || !promptKey.trim() || !selectedSection3CellId}
            title={testFile ? (!promptKey.trim() ? "Select a prompt first." : undefined) : "Choose or paste a test grid file first."}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            {uploadTestImageMutation.isPending ? "Uploading..." : "Upload Test Grid"}
          </button>
          <button
            type="button"
            onClick={() => submitRunMutation.mutate()}
            disabled={submitRunMutation.isPending || submitRunBlocker !== ""}
            title={submitRunBlocker || undefined}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitRunMutation.isPending ? "Submitting..." : "Analyse DNA"}
          </button>
          <button
            type="button"
            onClick={() => lookupRunMutation.mutate()}
            disabled={lookupRunMutation.isPending || lookupRunBlocker !== ""}
            title={lookupRunBlocker || undefined}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            {lookupRunMutation.isPending ? "Loading..." : "Get Run Status"}
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setShowOpenAiDebugPanel((value) => {
                const next = !value;
                if (next) {
                  setOpenAiDebugPollingEnabled(true);
                }
                return next;
              });
            }}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs"
          >
            {showOpenAiDebugPanel ? "Hide OpenAI Debug" : "Show OpenAI Debug"}
          </button>
        </div>
        {showOpenAiDebugPanel ? (
          <div className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">OpenAI Request/Response Debug</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenAiDebugPollingEnabled(true);
                    void openAiDebugLogQuery.refetch();
                  }}
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => clearOpenAiDebugLogMutation.mutate()}
                  disabled={clearOpenAiDebugLogMutation.isPending}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                >
                  {clearOpenAiDebugLogMutation.isPending ? "Clearing..." : "Clear Log"}
                </button>
              </div>
            </div>
            {openAiDebugLogQuery.isLoading ? (
              <p className="mt-2 text-[var(--muted)]">Loading debug log...</p>
            ) : null}
            {openAiDebugLogQuery.isError ? (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
                <p className="text-sm">Could not load debug log: {mutationErrorMessage(openAiDebugLogQuery.error)}</p>
                {openAiDebugLogQuery.error instanceof ApiRequestError && openAiDebugLogQuery.error.status === 404 ? (
                  <p className="mt-1 text-xs">
                    Debug endpoint not found on the running API. Restart API/frontend on latest code, then click Refresh.
                  </p>
                ) : null}
              </div>
            ) : null}
            {!openAiDebugLogQuery.isLoading && !openAiDebugLogQuery.isError ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-[var(--muted)]">
                  Enabled: {openAiDebugLogQuery.data?.enabled ? "true" : "false"} | Path: {openAiDebugLogQuery.data?.logPath || "(unknown)"}
                </p>
                {openAiDebugLogQuery.data?.events?.length ? (
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {(openAiDebugLogQuery.data.events || []).map((event, index) => (
                      <details key={`${event.timestamp || "t"}-${event.sessionId || "s"}-${index}`} className="rounded border border-[var(--line)] p-2">
                        <summary className="cursor-pointer text-xs">
                          [{event.timestamp || "-"}] {event.adapter || "unknown"} {event.phase || "event"} {event.status ? `(status ${event.status})` : ""}
                        </summary>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(event, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)]">No debug events yet.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {generatePromptBlockingReasons.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Prompt generation is disabled:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {generatePromptBlockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!testFile ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Test upload requires a selected test grid file.</p>
        ) : null}
        {submitRunBlockingReasons.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Run submit is disabled:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {submitRunBlockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">Run submit guardrails passed. Ready to submit.</p>
        )}
        {lookupRunBlockingReasons.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Run lookup is disabled:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {lookupRunBlockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {promptJobMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Prompt generation failed: {mutationErrorMessage(promptJobMutation.error)}</p>
        ) : null}
        {createStyleInfluenceMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Create style influence failed: {mutationErrorMessage(createStyleInfluenceMutation.error)}</p>
        ) : null}
        {removeStyleInfluenceMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Remove style influence failed: {mutationErrorMessage(removeStyleInfluenceMutation.error)}</p>
        ) : null}
        {section3MatrixPreviewRows.length > 0 ? (
          <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-medium">Generated Matrix Prompt Set</p>
            <p className="mt-1 text-[var(--muted)]">
              Family: {section3TestFamily === "profile_triplet" ? "profile triplet" : "sref matrix"}.
            </p>
            <div className="mt-3 space-y-3">
              {section3MatrixPreviewRows.map((row) => (
                <div key={`matrix-${row.promptKey}`} className="rounded border border-[var(--line)] p-2">
                  <p className="font-mono text-xs text-[var(--muted)]">{row.promptKey}</p>
                  <p>{row.promptText}</p>
                  <div className="mt-2 space-y-2">
                    {row.cells.map((cell) => (
                      <div key={`${row.promptKey}-${cell.cellId}`} className="rounded border border-[var(--line)] bg-[var(--surface-alt)] p-2">
                        <p className="text-xs font-medium text-[var(--muted)]">{cell.label}</p>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{cell.prompt}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {uploadTestImageMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Test upload failed: {mutationErrorMessage(uploadTestImageMutation.error)}</p>
        ) : null}
        {submitRunMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Run submit failed: {mutationErrorMessage(submitRunMutation.error)}</p>
        ) : null}
        {lookupRunMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Run lookup failed: {mutationErrorMessage(lookupRunMutation.error)}</p>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-medium">Prompts Pending</p>
            {section3PendingRows.length === 0 ? (
              <p className="mt-2 text-[var(--muted)]">No pending prompts.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {section3PendingRows.map((row) => (
                  <li key={`pending-${row.definition.promptKey}-${row.cell.cellId}`} className="rounded border border-[var(--line)] p-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-[var(--muted)]">{row.definition.promptKey}</p>
                        <p>{row.definition.promptText}</p>
                        <p className="text-xs text-[var(--muted)]">{row.cell.label}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copySection3Prompt(row.definition.promptKey, row.cell.cellId)}
                        disabled={!row.generatedPromptText}
                        className={`rounded px-2 py-1 text-xs ${row.copied ? "border border-green-600 text-green-700" : "border border-[var(--line)] text-[var(--ink)]"}`}
                      >
                        {row.copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Upload: {row.uploaded ? "completed" : "pending"} | Baseline: {row.baselineGridImageId ? "ready" : "missing"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-medium">Prompts Completed</p>
            {section3CompleteRows.length === 0 ? (
              <p className="mt-2 text-[var(--muted)]">No completed prompts yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {section3CompleteRows.map((row) => (
                  <li key={`complete-${row.definition.promptKey}-${row.cell.cellId}`} className="rounded border border-green-200 bg-green-50 p-2">
                    <p className="font-mono text-xs text-green-700">{row.definition.promptKey}</p>
                    <p className="text-green-800">{row.definition.promptText}</p>
                    <p className="text-xs text-green-700">{row.cell.label}</p>
                    <p className="mt-1 text-xs text-green-700">Test image: {row.testGridImageId}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {selectedSection3Row?.generatedPromptText ? (
          <div className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-medium">Selected Prompt Copy Block</p>
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">{selectedSection3Row.definition.promptKey}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{selectedSection3Row.cell.label}</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border border-[var(--line)] bg-[var(--surface-alt)] p-2 text-xs">
              {selectedSection3Row.generatedPromptText}
            </pre>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => copySection3Prompt(selectedSection3Row.definition.promptKey, selectedSection3Row.cell.cellId)}
                className={`rounded-lg px-3 py-1 text-xs ${selectedSection3Row.copied ? "border border-green-600 text-green-700" : "border border-[var(--line)]"}`}
              >
                {selectedSection3Row.copied ? "Copied" : "Copy to Clipboard"}
              </button>
            </div>
          </div>
        ) : null}
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
        {selectedSection3Row?.result?.canonicalTraits ? (
          <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p><span className="font-medium">Stored Traits ({selectedSection3Row.definition.promptKey}, {selectedSection3Row.cell.label}):</span></p>
            <p className="mt-1"><span className="font-medium">Vibe Shift:</span> {selectedSection3Row.result.canonicalTraits?.vibeShift || "(none)"}</p>
            <p><span className="font-medium">DNA Tags:</span> {(selectedSection3Row.result.canonicalTraits?.dominantDnaTags || []).join(", ") || "(none)"}</p>
            <p><span className="font-medium">Delta:</span> {selectedSection3Row.result.canonicalTraits?.deltaStrength?.score_1_to_10 ?? "-"}</p>
          </div>
        ) : null}
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
          <p className="font-medium">Accumulated Trait Analysis</p>
          {!styleInfluenceId.trim() ? (
            <p className="mt-2 text-[var(--muted)]">Select a Style Influence Id to view accumulated analysis.</p>
          ) : null}
          {styleInfluenceTraitSummaryQuery.isLoading ? (
            <p className="mt-2 text-[var(--muted)]">Loading accumulated analysis...</p>
          ) : null}
          {styleInfluenceTraitSummaryQuery.isError ? (
            <p className="mt-2 text-red-600">Could not load accumulated analysis.</p>
          ) : null}
          {styleInfluenceId.trim() && !styleInfluenceTraitSummaryQuery.isLoading && !styleInfluenceTraitSummaryQuery.isError && styleInfluenceTraitSummary ? (
            <div className="mt-2 space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <p><span className="font-medium">Completed runs:</span> {styleInfluenceTraitSummary.completedRunCount ?? 0}</p>
                <p><span className="font-medium">Prompt keys:</span> {styleInfluenceTraitSummary.completedPromptCount ?? 0}</p>
                <p><span className="font-medium">Cells:</span> {styleInfluenceTraitSummary.completedCellCount ?? 0}</p>
                <p><span className="font-medium">Avg delta:</span> {styleInfluenceTraitSummary.averageDeltaStrength ?? "-"}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded border border-[var(--line)] p-2">
                  <p className="font-medium">Top DNA Tags</p>
                  {styleInfluenceTraitSummary.topDnaTags?.length ? (
                    <ul className="mt-1 space-y-1">
                      {styleInfluenceTraitSummary.topDnaTags.slice(0, 5).map((item) => (
                        <li key={`dna-${item.value}`} className="text-xs">{item.value} ({item.count})</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--muted)]">(none)</p>
                  )}
                </div>
                <div className="rounded border border-[var(--line)] p-2">
                  <p className="font-medium">Top Vibe Shifts</p>
                  {styleInfluenceTraitSummary.topVibeShifts?.length ? (
                    <ul className="mt-1 space-y-1">
                      {styleInfluenceTraitSummary.topVibeShifts.slice(0, 5).map((item) => (
                        <li key={`vibe-${item.value}`} className="text-xs">{item.value} ({item.count})</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--muted)]">(none)</p>
                  )}
                </div>
                <div className="rounded border border-[var(--line)] p-2">
                  <p className="font-medium">Top Atomic Traits</p>
                  {styleInfluenceTraitSummary.topAtomicTraits?.length ? (
                    <ul className="mt-1 space-y-1">
                      {styleInfluenceTraitSummary.topAtomicTraits.slice(0, 5).map((item) => (
                        <li key={`atomic-${item.axis}-${item.trait}`} className="text-xs">{item.axis}: {item.trait} ({item.count})</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--muted)]">(none)</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
          <p className="font-medium">Trait Discovery Review Queue</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Pending unresolved traits requiring alias approval, canonical creation, or rejection.
          </p>
          {traitDiscoveriesQuery.isLoading ? (
            <p className="mt-2 text-[var(--muted)]">Loading pending discoveries...</p>
          ) : null}
          {traitDiscoveriesQuery.isError ? (
            <p className="mt-2 text-red-600">Could not load pending discovery queue.</p>
          ) : null}
          {!traitDiscoveriesQuery.isLoading && !traitDiscoveriesQuery.isError && pendingTraitDiscoveries.length === 0 ? (
            <p className="mt-2 text-[var(--muted)]">No pending trait discoveries.</p>
          ) : null}
          {!traitDiscoveriesQuery.isLoading && !traitDiscoveriesQuery.isError && pendingTraitDiscoveries.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {pendingTraitDiscoveries.slice(0, 20).map((discovery) => {
                const discoveryId = String(discovery.discoveryId || "").trim();
                const topCandidate = Array.isArray(discovery.topCandidates) ? discovery.topCandidates[0] : undefined;
                const draftCanonicalLabel = discoveryCreateLabelById[discoveryId] || discovery.rawTraitText || "";
                return (
                  <li key={discoveryId} className="rounded border border-[var(--line)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-[var(--muted)]">{discoveryId || "(discovery id missing)"}</p>
                        <p className="mt-1">
                          <span className="font-medium">Trait:</span> {discovery.rawTraitText || "(empty)"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          axis={discovery.axis || "(unknown)"} | seen={Number(discovery.seenCount || 0)}
                        </p>
                        {topCandidate ? (
                          <p className="mt-1 text-xs">
                            Top candidate: <span className="font-medium">{topCandidate.displayLabel || topCandidate.canonicalTraitId}</span>
                            {" "}({topCandidate.lexicalSimilarity ?? "-"} lex, {topCandidate.semanticSimilarity ?? "-"} sem)
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--muted)]">No candidate suggestions.</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!discoveryId || !topCandidate?.canonicalTraitId) {
                            return;
                          }
                          reviewTraitDiscoveryMutation.mutate({
                            discoveryId,
                            action: "approve_alias",
                            canonicalTraitId: String(topCandidate.canonicalTraitId),
                            note: "Approved top candidate from admin queue.",
                          });
                        }}
                        disabled={!discoveryId || !topCandidate?.canonicalTraitId || reviewTraitDiscoveryMutation.isPending}
                        className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Approve Top Alias
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!discoveryId) {
                            return;
                          }
                          reviewTraitDiscoveryMutation.mutate({
                            discoveryId,
                            action: "reject",
                            note: "Rejected from admin queue.",
                          });
                        }}
                        disabled={!discoveryId || reviewTraitDiscoveryMutation.isPending}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!discoveryId) {
                            return;
                          }
                          reviewTraitDiscoveryMutation.mutate({
                            discoveryId,
                            action: "ignore",
                            note: "Ignored from admin queue.",
                          });
                        }}
                        disabled={!discoveryId || reviewTraitDiscoveryMutation.isPending}
                        className="rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-50"
                      >
                        Ignore
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={draftCanonicalLabel}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setDiscoveryCreateLabelById((previous) => ({
                            ...previous,
                            [discoveryId]: nextValue,
                          }));
                        }}
                        placeholder="New canonical label"
                        className="min-w-[220px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!discoveryId || !draftCanonicalLabel.trim()) {
                            return;
                          }
                          reviewTraitDiscoveryMutation.mutate({
                            discoveryId,
                            action: "create_canonical",
                            canonicalDisplayLabel: draftCanonicalLabel.trim(),
                            note: "Created canonical from admin queue.",
                          });
                        }}
                        disabled={!discoveryId || !draftCanonicalLabel.trim() || reviewTraitDiscoveryMutation.isPending}
                        className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Create Canonical
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {reviewTraitDiscoveryMutation.isError ? (
            <p className="mt-2 text-red-600">Discovery review failed: {mutationErrorMessage(reviewTraitDiscoveryMutation.error)}</p>
          ) : null}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
          <p className="font-medium">Canonical Trait Library</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Curate canonical traits and aliases used by discovery review and canonicalization.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <label className="text-xs">
              Axis
              <select
                value={canonicalAxisFilter}
                onChange={(event) => setCanonicalAxisFilter(event.currentTarget.value)}
                className="mt-1 w-full rounded border border-[var(--line)] bg-transparent px-2 py-1"
              >
                <option value="composition_and_structure">composition_and_structure</option>
                <option value="lighting_and_contrast">lighting_and_contrast</option>
                <option value="color_palette">color_palette</option>
                <option value="texture_and_medium">texture_and_medium</option>
                <option value="dominant_dna_tags">dominant_dna_tags</option>
              </select>
            </label>
            <label className="text-xs">
              Status Filter
              <select
                value={canonicalStatusFilter}
                onChange={(event) => setCanonicalStatusFilter(event.currentTarget.value as "active" | "deprecated" | "")}
                className="mt-1 w-full rounded border border-[var(--line)] bg-transparent px-2 py-1"
              >
                <option value="active">active</option>
                <option value="deprecated">deprecated</option>
                <option value="">all</option>
              </select>
            </label>
            <div className="text-xs text-[var(--muted)]">
              <p className="mt-5">Traits: {canonicalTraits.length}</p>
              <p>Aliases (axis): {axisTraitAliases.length}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-[var(--line)] p-2">
              <p className="font-medium">Create Canonical Trait</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={canonicalCreateLabel}
                  onChange={(event) => setCanonicalCreateLabel(event.currentTarget.value)}
                  placeholder="display label"
                  className="min-w-[220px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  value={canonicalCreateNote}
                  onChange={(event) => setCanonicalCreateNote(event.currentTarget.value)}
                  placeholder="note (optional)"
                  className="min-w-[220px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => createCanonicalTraitMutation.mutate()}
                  disabled={!canonicalCreateLabel.trim() || createCanonicalTraitMutation.isPending}
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                >
                  Create
                </button>
              </div>
              {createCanonicalTraitMutation.isError ? (
                <p className="mt-2 text-red-600">Create failed: {mutationErrorMessage(createCanonicalTraitMutation.error)}</p>
              ) : null}
            </div>
            <div className="rounded border border-[var(--line)] p-2">
              <p className="font-medium">Create Alias</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={selectedCanonicalTraitId}
                  onChange={(event) => setSelectedCanonicalTraitId(event.currentTarget.value)}
                  className="min-w-[220px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                >
                  {canonicalTraits.map((item) => (
                    <option key={String(item.canonicalTraitId || "")} value={String(item.canonicalTraitId || "")}>
                      {item.displayLabel} ({item.status})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={aliasCreateText}
                  onChange={(event) => setAliasCreateText(event.currentTarget.value)}
                  placeholder="alias text"
                  className="min-w-[180px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  value={aliasCreateNote}
                  onChange={(event) => setAliasCreateNote(event.currentTarget.value)}
                  placeholder="note (optional)"
                  className="min-w-[180px] rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => createTraitAliasMutation.mutate()}
                  disabled={!selectedCanonicalTraitId || !aliasCreateText.trim() || createTraitAliasMutation.isPending}
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                >
                  Add Alias
                </button>
              </div>
              {createTraitAliasMutation.isError ? (
                <p className="mt-2 text-red-600">Alias create failed: {mutationErrorMessage(createTraitAliasMutation.error)}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-[var(--line)] p-2">
              <p className="font-medium">Canonical Traits</p>
              {canonicalTraitsQuery.isLoading ? (
                <p className="mt-2 text-[var(--muted)]">Loading canonical traits...</p>
              ) : null}
              {canonicalTraitsQuery.isError ? (
                <p className="mt-2 text-red-600">Could not load canonical traits.</p>
              ) : null}
              {!canonicalTraitsQuery.isLoading && !canonicalTraitsQuery.isError && canonicalTraits.length === 0 ? (
                <p className="mt-2 text-[var(--muted)]">No canonical traits for selected filter.</p>
              ) : null}
              {!canonicalTraitsQuery.isLoading && !canonicalTraitsQuery.isError && canonicalTraits.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {canonicalTraits.slice(0, 30).map((trait) => {
                    const traitId = String(trait.canonicalTraitId || "");
                    const active = traitId === selectedCanonicalTraitId;
                    const nextStatus = trait.status === "deprecated" ? "active" : "deprecated";
                    return (
                      <li key={traitId} className={`rounded border p-2 ${active ? "border-blue-300 bg-blue-50" : "border-[var(--line)]"}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCanonicalTraitId(traitId)}
                            className="text-left"
                          >
                            <p className="text-xs font-mono text-[var(--muted)]">{traitId}</p>
                            <p className="font-medium">{trait.displayLabel}</p>
                            <p className="text-xs text-[var(--muted)]">{trait.status} | {trait.axis}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!traitId) {
                                return;
                              }
                              updateCanonicalTraitStatusMutation.mutate({
                                canonicalTraitId: traitId,
                                status: nextStatus,
                                note: `Status updated from admin canonical library (${nextStatus}).`,
                              });
                            }}
                            disabled={!traitId || updateCanonicalTraitStatusMutation.isPending}
                            className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                          >
                            Mark {nextStatus}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {updateCanonicalTraitStatusMutation.isError ? (
                <p className="mt-2 text-red-600">Status update failed: {mutationErrorMessage(updateCanonicalTraitStatusMutation.error)}</p>
              ) : null}
            </div>
            <div className="rounded border border-[var(--line)] p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Aliases For Selected Canonical Trait</p>
                <select
                  value={aliasStatusFilter}
                  onChange={(event) => setAliasStatusFilter(event.currentTarget.value as "active" | "deprecated" | "")}
                  className="rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                >
                  <option value="">all statuses</option>
                  <option value="active">active</option>
                  <option value="deprecated">deprecated</option>
                </select>
              </div>
              {traitAliasesQuery.isLoading ? (
                <p className="mt-2 text-[var(--muted)]">Loading aliases...</p>
              ) : null}
              {traitAliasesQuery.isError ? (
                <p className="mt-2 text-red-600">Could not load aliases.</p>
              ) : null}
              {!traitAliasesQuery.isLoading && !traitAliasesQuery.isError && !selectedCanonicalTrait ? (
                <p className="mt-2 text-[var(--muted)]">Select a canonical trait to inspect aliases.</p>
              ) : null}
              {!traitAliasesQuery.isLoading && !traitAliasesQuery.isError && selectedCanonicalTrait && selectedCanonicalTraitAliases.length === 0 ? (
                <p className="mt-2 text-[var(--muted)]">No aliases for selected canonical trait.</p>
              ) : null}
              {!traitAliasesQuery.isLoading && !traitAliasesQuery.isError && selectedCanonicalTraitAliases.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {selectedCanonicalTraitAliases.slice(0, 40).map((alias) => (
                    <li key={String(alias.aliasId || "")} className="rounded border border-[var(--line)] p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{alias.aliasText}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const aliasId = String(alias.aliasId || "").trim();
                            if (!aliasId) {
                              return;
                            }
                            const nextStatus = alias.status === "deprecated" ? "active" : "deprecated";
                            updateTraitAliasStatusMutation.mutate({
                              aliasId,
                              status: nextStatus,
                              note: `Status updated from canonical trait library (${nextStatus}).`,
                            });
                          }}
                          disabled={!alias.aliasId || updateTraitAliasStatusMutation.isPending}
                          className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Mark {alias.status === "deprecated" ? "active" : "deprecated"}
                        </button>
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        {alias.status} |{" "}
                        {alias.source} | {alias.mergeMethod}
                        {alias.semanticSimilarity !== null && alias.semanticSimilarity !== undefined ? ` | sem=${alias.semanticSimilarity}` : ""}
                        {alias.lexicalSimilarity !== null && alias.lexicalSimilarity !== undefined ? ` | lex=${alias.lexicalSimilarity}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {updateTraitAliasStatusMutation.isError ? (
                <p className="mt-2 text-red-600">Alias status update failed: {mutationErrorMessage(updateTraitAliasStatusMutation.error)}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Trait Discovery Review History</p>
            <select
              value={reviewHistoryStatus}
              onChange={(event) => {
                const next = event.currentTarget.value as "approved_alias" | "approved_new_canonical" | "rejected" | "ignored";
                setReviewHistoryStatus(next);
              }}
              className="rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
            >
              <option value="approved_alias">Approved Alias</option>
              <option value="approved_new_canonical">Approved New Canonical</option>
              <option value="rejected">Rejected</option>
              <option value="ignored">Ignored</option>
            </select>
          </div>
          {traitDiscoveryHistoryQuery.isLoading ? (
            <p className="mt-2 text-[var(--muted)]">Loading review history...</p>
          ) : null}
          {traitDiscoveryHistoryQuery.isError ? (
            <p className="mt-2 text-red-600">Could not load review history.</p>
          ) : null}
          {!traitDiscoveryHistoryQuery.isLoading && !traitDiscoveryHistoryQuery.isError && reviewHistoryDiscoveries.length === 0 ? (
            <p className="mt-2 text-[var(--muted)]">No records for this status yet.</p>
          ) : null}
          {!traitDiscoveryHistoryQuery.isLoading && !traitDiscoveryHistoryQuery.isError && reviewHistoryDiscoveries.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {reviewHistoryDiscoveries.slice(0, 20).map((item) => (
                <li key={String(item.discoveryId || "")} className="rounded border border-[var(--line)] p-2">
                  <p className="font-mono text-xs text-[var(--muted)]">{item.discoveryId}</p>
                  <p className="mt-1">
                    <span className="font-medium">Trait:</span> {item.rawTraitText || "(empty)"}{" "}
                    <span className="text-[var(--muted)]">[{item.axis}]</span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Reviewed by {item.resolutionPayload?.reviewedBy || "(unknown)"} at {item.resolutionPayload?.reviewedAt || item.lastSeenAt || "(unknown time)"}
                  </p>
                  {item.resolutionPayload?.canonicalDisplayLabel || item.resolutionPayload?.canonicalTraitId ? (
                    <p className="text-xs">
                      Canonical: {item.resolutionPayload?.canonicalDisplayLabel || item.resolutionPayload?.canonicalTraitId}
                    </p>
                  ) : null}
                  {item.resolutionPayload?.note ? (
                    <p className="text-xs text-[var(--muted)]">Note: {item.resolutionPayload.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </main>
  );
}
