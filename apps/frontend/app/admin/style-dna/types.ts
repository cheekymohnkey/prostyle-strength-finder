
export type SessionStateResponse =
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

export type StyleInfluenceCatalogItem = {
  styleInfluenceId?: string;
  typeKey?: "profile" | "sref" | string | null;
  influenceCode?: string;
  status?: string;
  uploadedImageCount?: number;
};

export type StyleInfluenceListResponse = {
  styleInfluences?: StyleInfluenceCatalogItem[];
};

export type EndpointProbe = {
  status: number;
  ready: boolean;
};

export type PromptJobResponse = {
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

export type StyleDnaRunSubmitResponse = {
  run?: {
    styleDnaRunId?: string;
  };
  styleDnaRunId?: string;
};

export type StyleDnaRunLookupResponse = {
  run?: {
    styleDnaRunId?: string;
    status?: string;
    promptKey?: string;
    stylizeTier?: number;
    styleAdjustmentType?: "sref" | "profile" | string;
    styleAdjustmentMidjourneyId?: string;
    baselineRenderSetId?: string;
    baselineGridImageId?: string;
    testGridImageId?: string;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    createdAt?: string;
    updatedAt?: string;
    submittedTestEnvelope?: Record<string, unknown>;
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

export type StyleDnaRun = {
  styleDnaRunId?: string;
  idempotencyKey?: string;
  styleInfluenceId?: string;
  baselineRenderSetId?: string;
  styleAdjustmentType?: "sref" | "profile" | string;
  styleAdjustmentMidjourneyId?: string;
  promptKey?: string;
  stylizeTier?: number;
  baselineGridImageId?: string;
  testGridImageId?: string;
  analysisRunId?: string | null;
  status?: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type StyleDnaRunListResponse = {
  runs?: StyleDnaRun[];
};

export type TraitSummaryResponse = {
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

export type TraitDiscoveryCandidate = {
  canonicalTraitId?: string;
  displayLabel?: string;
  lexicalSimilarity?: number;
  semanticSimilarity?: number;
};

export type TraitDiscovery = {
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

export type TraitDiscoveryListResponse = {
  discoveries?: TraitDiscovery[];
};

export type CanonicalTrait = {
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

export type CanonicalTraitListResponse = {
  canonicalTraits?: CanonicalTrait[];
};

export type CanonicalTraitMutationResponse = {
  canonicalTrait?: CanonicalTrait;
  deduplicated?: boolean;
  changed?: boolean;
};

export type TraitAlias = {
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

export type TraitAliasListResponse = {
  traitAliases?: TraitAlias[];
};

export type TraitAliasMutationResponse = {
  traitAlias?: TraitAlias;
  deduplicated?: boolean;
};

export type OpenAiDebugEvent = {
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

export type OpenAiDebugLogResponse = {
  enabled?: boolean;
  logPath?: string;
  events?: OpenAiDebugEvent[];
};

export type Section3PromptProgress = {
  copied?: boolean;
  generatedPromptText?: string;
  testGridImageId?: string;
  runId?: string;
  runStatus?: string;
  result?: StyleDnaRunLookupResponse["result"];
};

export type Section3TestFamily = "profile_triplet" | "sref_matrix";

export type Section3TestCell = {
  cellId: string;
  label: string;
  stylizeTier: number;
  styleWeight?: number;
};

export type StyleDnaImageUploadResponse = {
  image?: {
    styleDnaImageId?: string;
    storageUri?: string;
    mimeType?: string;
  };
};

export type BaselinePromptDefinition = {
  promptKey: string;
  promptText: string;
  displayOrder: number;
  domain?: string | null;
  whatItTests?: string | null;
};

export type BaselineSetDetailResponse = {
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

export type BaselineSetSummary = {
  baselineRenderSetId: string;
  suiteId: string;
  mjModelFamily: string;
  mjModelVersion: string;
  parameterEnvelope?: {
    stylizeTier?: number | string;
  };
};

export type BaselineSetListResponse = {
  baselineSets?: BaselineSetSummary[];
};

export class ApiRequestError extends Error {
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

export async function parseApiResponse<T>(response: Response): Promise<T> {
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
      : "Request failed";
    throw new ApiRequestError(message, { status: response.status, code, reason });
  }
  return json as T;
}

// -- UI Types --

