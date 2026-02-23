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
  const queryClient = useQueryClient();

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
        setUploadedTestPreviewUrl(styleDnaImageContentPath(id));
      }
      setTestClipboardStatus(id ? `Upload succeeded: ${id}` : "Upload succeeded");
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

  const baselinePreviewUrl = baselineFilePreviewUrl || uploadedBaselinePreviewUrl;
  const testPreviewUrl = testFilePreviewUrl || uploadedTestPreviewUrl;
  const baselineStyleWeight = baselineEnvelope?.styleWeight !== undefined
    ? Number(baselineEnvelope.styleWeight)
    : Number.NaN;
  const loadedBaselineSet = baselineSetDetailQuery.data?.baselineRenderSet;
  const loadedEnvelope = loadedBaselineSet?.parameterEnvelope;

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
    const runStylizeTier = Number(stylizeTier);
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
    if (!testGridImageId.trim()) {
      reasons.push("Upload a test grid image first.");
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
    suiteId,
    testGridImageId,
  ]);
  const submitRunBlocker = submitRunBlockingReasons[0] || "";

  const lookupRunBlockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!lastStyleDnaRunId.trim()) {
      reasons.push("Enter a Style-DNA run id first.");
    }
    if (styleDnaProbeQuery.data?.ready === false) {
      reasons.push("Style-DNA admin endpoints are not available.");
    }
    return reasons;
  }, [lastStyleDnaRunId, styleDnaProbeQuery.data?.ready]);
  const lookupRunBlocker = lookupRunBlockingReasons[0] || "";

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
          <div className="mt-2 text-sm text-[var(--muted)]">
            <p>Save is disabled:</p>
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
          <div className="mt-2 text-sm text-[var(--muted)]">
            <p>Attach is disabled:</p>
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
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Style Adjustment Type</span>
            <select value={styleAdjustmentType} onChange={(event) => setStyleAdjustmentType(event.target.value as "sref" | "profile")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              <option value="sref">sref</option>
              <option value="profile">profile</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Style Adjustment Midjourney Id</span>
            <input value={styleAdjustmentMidjourneyId} onChange={(event) => setStyleAdjustmentMidjourneyId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Style Influence Id</span>
            <select value={styleInfluenceId} onChange={(event) => setStyleInfluenceId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              <option value="">select style influence</option>
              {availableInfluences.map((influence) => (
                <option key={influence.id} value={influence.id}>{influence.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Test Grid Image Id</span>
            <input value={testGridImageId} onChange={(event) => setTestGridImageId(event.target.value)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
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
        {(testPreviewUrl || testGridImageId) ? (
          <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-[var(--line)] p-3">
            {testPreviewUrl ? (
              <img
                src={testPreviewUrl}
                alt="Test grid preview"
                className="h-24 w-24 rounded border border-[var(--line)] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--muted)]">
                no preview
              </div>
            )}
            <div className="text-sm">
              <p><span className="font-medium">Test Image Id:</span> {testGridImageId || "(not uploaded yet)"}</p>
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
            onClick={() => uploadTestImageMutation.mutate()}
            disabled={uploadTestImageMutation.isPending || !testFile}
            title={testFile ? undefined : "Choose or paste a test grid file first."}
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
            {submitRunMutation.isPending ? "Submitting..." : "Submit Comparison Run"}
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
        {generatePromptBlockingReasons.length > 0 ? (
          <div className="mt-2 text-sm text-[var(--muted)]">
            <p>Prompt generation is disabled:</p>
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
          <div className="mt-2 text-sm text-[var(--muted)]">
            <p>Run submit is disabled:</p>
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
          <div className="mt-2 text-sm text-[var(--muted)]">
            <p>Run lookup is disabled:</p>
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
        {uploadTestImageMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Test upload failed: {mutationErrorMessage(uploadTestImageMutation.error)}</p>
        ) : null}
        {submitRunMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Run submit failed: {mutationErrorMessage(submitRunMutation.error)}</p>
        ) : null}
        {lookupRunMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Run lookup failed: {mutationErrorMessage(lookupRunMutation.error)}</p>
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
      </section>
    </main>
  );
}
