"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StudioLayout } from "./components/StudioLayout";
import { NewInfluenceModal } from "./components/NewInfluenceModal";
import { useStyleStudioStore } from "./store";
import { 
  BaselineSetListResponse, 
  BaselineSetDetailResponse,
  parseApiResponse, 
  ApiRequestError,
  BaselinePromptDefinition,
    StyleDnaImageUploadResponse,
  StyleInfluenceListResponse,
  StyleDnaRunSubmitResponse,
    Section3TestCell,
    TraitSummaryResponse,
    StyleDnaRunListResponse,
    StyleDnaRun,
    StyleDnaRunLookupResponse
} from "./types";

// Helper Functions
function styleDnaImageContentPath(imageId: string): string {
  return `/api/proxy/admin/style-dna/images/${encodeURIComponent(imageId)}/content`;
}

function buildStyleDnaProvenanceReceipt(input: { imageKind: "baseline" | "test"; fileName: string }) {
    return {
        source: "studio_manual_upload",
        capturedAtUtc: new Date().toISOString(),
        operatorAssertion: `${input.imageKind}_grid_uploaded_via_studio:${input.fileName}`,
    };
}

function formatActionRequiredCopy(message: string): string {
    const normalized = String(message || "").trim().replace(/[.\s]+$/g, "");
    if (!normalized) return "Action required.";
    return `Action required: ${normalized}.`;
}

function normalizeAspectRatioValue(input: unknown): string {
    return String(input || "").trim().replace(/\s+/g, "");
}

export default function StudioPage() {
  const queryClient = useQueryClient();
  const { 
    mjModelFamily, setMjModelFamily,
    mjModelVersion, setMjModelVersion,
    stylizeTier, setStylizeTier,
    activePromptKey, setActivePromptKey,
    activeBaselineSetId, setActiveBaselineSetId,
    activeStyleInfluenceId, setActiveStyleInfluenceId
  } = useStyleStudioStore();

  // --- 1. Global Context & Baseline Data ---

  // Fetch List of Baseline Sets for the Toolbar Selector (implied)
  const baselineSetListQuery = useQuery<BaselineSetListResponse, ApiRequestError>({
    queryKey: ["admin", "style-dna", "baseline-sets"],
    queryFn: async () => {
      const resp = await fetch("/api/proxy/admin/style-dna/baseline-sets");
      return parseApiResponse<BaselineSetListResponse>(resp);
    },
    staleTime: 60000,
  });

  // Auto-select the first Baseline Set if none is active
  useEffect(() => {
    if (!activeBaselineSetId && baselineSetListQuery.data?.baselineSets?.length) {
            // Prefer v7 standard s100 with 16:9 if available, then any v7 standard s100, then first set.
            const preferred169 = baselineSetListQuery.data.baselineSets.find(s => 
                s.mjModelFamily === 'standard' &&
                s.mjModelVersion === '7' &&
                Number(s.parameterEnvelope?.stylizeTier) === 100 &&
                normalizeAspectRatioValue((s as any)?.parameterEnvelope?.aspectRatio) === '16:9'
            );
            const preferred = baselineSetListQuery.data.baselineSets.find(s => 
                s.mjModelFamily === 'standard' && s.mjModelVersion === '7' && Number(s.parameterEnvelope?.stylizeTier) === 100
            );
      const fallback = baselineSetListQuery.data.baselineSets[0];
            setActiveBaselineSetId((preferred169 || preferred || fallback).baselineRenderSetId);
    }
  }, [activeBaselineSetId, baselineSetListQuery.data, setActiveBaselineSetId]);

  // Fetch Details of the Active Baseline Set
  const baselineSetDetailQuery = useQuery<BaselineSetDetailResponse, ApiRequestError>({
    queryKey: ["admin", "style-dna", "baseline-sets", activeBaselineSetId],
    queryFn: async () => {
      if (!activeBaselineSetId) throw new Error("No id");
      const resp = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(activeBaselineSetId)}`);
      return parseApiResponse<BaselineSetDetailResponse>(resp);
    },
    enabled: !!activeBaselineSetId,
  });

  // Sync Global Context when Baseline Set Details Load
  useEffect(() => {
    if (baselineSetDetailQuery.data?.baselineRenderSet) {
      const set = baselineSetDetailQuery.data.baselineRenderSet;
      
      // Update global context only if changed to avoid loops
      // We assume the store handles unnecessary updates gracefully or check here
      if (set.mjModelFamily) setMjModelFamily(set.mjModelFamily as any);
      if (set.mjModelVersion) setMjModelVersion(set.mjModelVersion);
      if (set.parameterEnvelope?.stylizeTier !== undefined) {
        setStylizeTier(Number(set.parameterEnvelope.stylizeTier));
      }
    }
  }, [baselineSetDetailQuery.data, setMjModelFamily, setMjModelVersion, setStylizeTier]);

  // Derived: Prompt Definitions (sorted)
  const baselinePromptDefinitions = useMemo(() => {
    const prompts = baselineSetDetailQuery.data?.promptDefinitions || [];
    return [...prompts].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [baselineSetDetailQuery.data]);

  // Derived: Active Baseline Image
  // Find the image item matching the active prompt + stylize tier
  const activeBaselineItem = useMemo(() => {
    return baselineSetDetailQuery.data?.items?.find(
        i => i.promptKey === activePromptKey && i.stylizeTier === Number(stylizeTier)
    );
  }, [baselineSetDetailQuery.data?.items, activePromptKey, stylizeTier]);

  // Auto-select first prompt if none selected
  useEffect(() => {
    if (!activePromptKey && baselinePromptDefinitions.length > 0) {
      setActivePromptKey(baselinePromptDefinitions[0].promptKey);
    }
  }, [activePromptKey, baselinePromptDefinitions, setActivePromptKey]);


  // --- 2. Baseline Actions (Upload/Attach) ---
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [isDraggingBaseline, setIsDraggingBaseline] = useState(false);
  const [baselinePreviewUrl, setBaselinePreviewUrl] = useState<string>("");

  useEffect(() => {
    if (!baselineFile) {
        setBaselinePreviewUrl("");
        return;
    }
    const url = URL.createObjectURL(baselineFile);
    setBaselinePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [baselineFile]);

  const attachBaselineItemMutation = useMutation({
    mutationFn: async (imageId: string) => {
        if (!activeBaselineSetId || !activePromptKey) throw new Error("Missing context");
        const payload = {
            promptKey: activePromptKey,
            stylizeTier: Number(stylizeTier),
            gridImageId: imageId
        };
        const resp = await fetch(`/api/proxy/admin/style-dna/baseline-sets/${encodeURIComponent(activeBaselineSetId)}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return parseApiResponse(resp);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "style-dna", "baseline-sets", activeBaselineSetId] });
        setBaselineFile(null); // Clear input
    },
    onError: (err) => {
        console.error("Attach baseline item failed:", err);
        alert(`Failed to attach image to baseline set: ${err.message}`);
    }
  });

  const uploadBaselineImageMutation = useMutation({
    mutationFn: async () => {
      if (!baselineFile) throw new Error("No file selected");
      
      const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            // Strip data:image/*;base64, prefix
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = error => reject(error);
        });
      };

      const base64 = await fileToBase64(baselineFile);
      
      const payload = {
        fileBase64: base64,
        fileName: baselineFile.name,
        mimeType: baselineFile.type,
                imageKind: "baseline",
                provenanceReceipt: buildStyleDnaProvenanceReceipt({
                    imageKind: "baseline",
                    fileName: baselineFile.name,
                }),
      };
      
      const resp = await fetch("/api/proxy/admin/style-dna/images", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload) 
      });
      return parseApiResponse<StyleDnaImageUploadResponse>(resp);
    },
    onSuccess: (data) => {
        // console.log("Upload success:", data);
        if (data.image?.styleDnaImageId && activeBaselineSetId && activePromptKey) {
            attachBaselineItemMutation.mutate(data.image.styleDnaImageId);
        } else {
            console.error("Missing context for attachment:", { 
                imageId: data.image?.styleDnaImageId, 
                setId: activeBaselineSetId, 
                prompt: activePromptKey 
            });
            alert("Upload succeeded but could not attach to baseline set. Check console.");
        }
    },
    onError: (err) => {
        console.error("Upload failed:", err);
        alert(`Upload failed: ${err.message}`);
    }
  });


  // --- 3. Style Influence (Target) Data ---
  const [styleAdjustmentType, setStyleAdjustmentType] = useState<"sref" | "profile">("sref");
    const [showNewInfluenceModal, setShowNewInfluenceModal] = useState(false);
    const [newInfluenceError, setNewInfluenceError] = useState<string | null>(null);
  
  const styleInfluenceListQuery = useQuery<StyleInfluenceListResponse, ApiRequestError>({
    queryKey: ["admin", "style-dna", "style-influences"],
    queryFn: async () => {
      const resp = await fetch("/api/proxy/admin/style-influences");
      return parseApiResponse<StyleInfluenceListResponse>(resp);
    }
  });

  const availableInfluences = useMemo(() => {
    return (styleInfluenceListQuery.data?.styleInfluences || []).map(inf => ({
      id: inf.styleInfluenceId || "",
      label: `${inf.influenceCode} (${inf.typeKey})`,
      code: inf.influenceCode,
      typeKey: inf.typeKey, 
      imageCount: inf.uploadedImageCount
    }));
  }, [styleInfluenceListQuery.data]);

    const createInfluenceMutation = useMutation({
        mutationFn: async (input: { influenceType: "sref" | "profile"; influenceCode: string }) => {
            const resp = await fetch("/api/proxy/admin/style-influences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    influenceType: input.influenceType,
                    influenceCode: input.influenceCode,
                }),
            });
            return parseApiResponse<{ styleInfluence?: { styleInfluenceId?: string } }>(resp);
        },
        onSuccess: async (data) => {
            const createdId = String(data.styleInfluence?.styleInfluenceId || "").trim();
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["admin", "style-dna", "style-influences"] }),
                queryClient.invalidateQueries({ queryKey: ["admin", "style-influences"] }),
            ]);
            if (createdId) {
                setActiveStyleInfluenceId(createdId);
            }
            setNewInfluenceError(null);
            setShowNewInfluenceModal(false);
        },
        onError: (error: any) => {
            const message = error?.message || "Failed to create influence";
            setNewInfluenceError(message);
        },
    });

  const activeInfluence = availableInfluences.find(i => i.id === activeStyleInfluenceId);

    // Trait summary for the selected influence (recent runs/results)
    const traitSummaryQuery = useQuery<TraitSummaryResponse, ApiRequestError>({
        queryKey: ["admin", "style-dna", "trait-summary", activeStyleInfluenceId],
        queryFn: async () => {
            if (!activeStyleInfluenceId) throw new Error("No id");
            const resp = await fetch(`/api/proxy/admin/style-dna/style-influences/${encodeURIComponent(activeStyleInfluenceId)}/trait-summary`);
            return parseApiResponse<TraitSummaryResponse>(resp);
        },
        enabled: !!activeStyleInfluenceId,
        staleTime: 15000,
    });

  // Auto-detect style adjustment type from selected influence
  useEffect(() => {
    if (activeInfluence) {
      const lowerLabel = (activeInfluence.label || "").toLowerCase();
      const lowerType = (activeInfluence.typeKey || "").toLowerCase();
      
      // Check for PROFILE
      if (lowerType === "profile" || lowerType.includes("profile") || lowerLabel.includes("(profile")) {
            setStyleAdjustmentType("profile");
      } 
      // Check for SREF (or default if it looks like an sref code)
      // We assume if it's explicitly marked as sref OR if it's not profile, it's likely sref.
      // But let's be specific first.
      else if (lowerType === "sref" || lowerType.includes("sref") || lowerLabel.includes("(sref")) {
            setStyleAdjustmentType("sref");
      }
      
      // If we can't determine, we just leave it alone (user manual override persists)
    }
  }, [activeInfluence]);


  // --- 4. Section 3 / Analysis Actions ---
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isDraggingTest, setIsDraggingTest] = useState(false);
    const [testPreviewUrl, setTestPreviewUrl] = useState<string>("");
    const [existingTestImageId, setExistingTestImageId] = useState<string | null>(null);
    const [existingRunContext, setExistingRunContext] = useState<{
        runId: string;
        promptKey?: string;
        baselineRenderSetId?: string;
        stylizeTier?: number;
        styleAdjustmentType?: "sref" | "profile" | string;
    } | null>(null);
    const [pendingRetryStylizeTier, setPendingRetryStylizeTier] = useState<number | null>(null);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [isRunDetailModalOpen, setIsRunDetailModalOpen] = useState(false);
    const [runStatusFilter, setRunStatusFilter] = useState<string>("all");
    const [runFetchLimit, setRunFetchLimit] = useState<number>(50);
    const [runPage, setRunPage] = useState<number>(1);
    const [isExportingRunDetails, setIsExportingRunDetails] = useState(false);
    const runPageSize = 10;
    const newInfluenceTriggerRef = useRef<HTMLButtonElement | null>(null);
    const runDetailTriggerRef = useRef<HTMLButtonElement | null>(null);
    const runDetailModalRef = useRef<HTMLDivElement | null>(null);
    const runDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Test Cells Configuration
  const section3TestCells = useMemo<Section3TestCell[]>(() => {
    if (styleAdjustmentType === "profile") {
      return [
        { cellId: "profile_s0", label: "--s 0", stylizeTier: 0 },
        { cellId: "profile_s100", label: "--s 100", stylizeTier: 100 },
        { cellId: "profile_s1000", label: "--s 1000", stylizeTier: 1000 },
      ];
    } else {
      // sref matrix
      return [
        { cellId: "sref_s0_sw0", label: "--s 0 --sw 0", stylizeTier: 0, styleWeight: 0 },
        { cellId: "sref_s0_sw1000", label: "--s 0 --sw 1000", stylizeTier: 0, styleWeight: 1000 },
        { cellId: "sref_s100_sw250", label: "--s 100 --sw 250", stylizeTier: 100, styleWeight: 250 },
        { cellId: "sref_s1000_sw1000", label: "--s 1000 --sw 1000", stylizeTier: 1000, styleWeight: 1000 },
      ];
    }
  }, [styleAdjustmentType]); // Depend on styleAdjustmentType instead of section3TestFamily

  const [activeCellId, setActiveCellId] = useState<string>("");

  // Select first cell by default when type changes
  useEffect(() => {
    if (section3TestCells.length > 0) {
        // Preserve selection if valid, else pick first
        const exists = section3TestCells.find(c => c.cellId === activeCellId);
        if (!exists) {
            setActiveCellId(section3TestCells[0].cellId);
        }
    }
  }, [section3TestCells, activeCellId]);

  const activeTestCell = section3TestCells.find(c => c.cellId === activeCellId) || section3TestCells[0];

    useEffect(() => {
        if (!testFile) {
            setTestPreviewUrl("");
            return;
        }
        const url = URL.createObjectURL(testFile);
        setTestPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [testFile]);

    useEffect(() => {
        // If a new file is being prepared, drop any saved reference so we don't mix sources.
        if (testFile) {
            setExistingTestImageId(null);
            setExistingRunContext(null);
        }
    }, [testFile]);

    // Auto-switch Baseline Set Context when Test Cell requires a different source tier
  // Requirement: Source Baseline --s X must match Target Test --s X
  // (Or for SREF where --s is usually fixed or matched, we enforce consistency)
  useEffect(() => {
    if (!activeTestCell || !baselineSetListQuery.data?.baselineSets) return;
    
    // We only care about matching the stylize tier.
    // We assume the user wants to stay within the same model family/version context if possible.
    const targetTier = activeTestCell.stylizeTier;
    
    // Using current active set just to grab family/version context (if exists), otherwise defaults
    const currentSet = baselineSetListQuery.data.baselineSets.find(s => s.baselineRenderSetId === activeBaselineSetId);
    const preferredFamily = currentSet?.mjModelFamily || 'standard';
    const preferredVersion = currentSet?.mjModelVersion || '7';
    const preferredAspectRatio = normalizeAspectRatioValue((currentSet as any)?.parameterEnvelope?.aspectRatio) || '16:9';

    const matchingSetSameAr = baselineSetListQuery.data.baselineSets.find(s => 
        s.mjModelFamily === preferredFamily &&
        s.mjModelVersion === preferredVersion &&
        Number(s.parameterEnvelope?.stylizeTier) === targetTier &&
        normalizeAspectRatioValue((s as any)?.parameterEnvelope?.aspectRatio) === preferredAspectRatio
    );

    const matchingSet = baselineSetListQuery.data.baselineSets.find(s => 
        s.mjModelFamily === preferredFamily && 
        s.mjModelVersion === preferredVersion && 
        Number(s.parameterEnvelope?.stylizeTier) === targetTier
    );

    const chosenSet = matchingSetSameAr || matchingSet;

    if (chosenSet && chosenSet.baselineRenderSetId !== activeBaselineSetId) {
        // console.log(`Auto-switching baseline context to match tier s${targetTier}`);
        setActiveBaselineSetId(chosenSet.baselineRenderSetId);
    }
  }, [activeTestCell, baselineSetListQuery.data, activeBaselineSetId, setActiveBaselineSetId]);

  // Logic to build the Prompt String
  const activePromptDefinition = baselinePromptDefinitions.find(d => d.promptKey === activePromptKey);
  
  const constructedPrompt = useMemo(() => {
    if (!activePromptDefinition || !activeInfluence) return "";
    
    let line = `/imagine prompt: ${activePromptDefinition.promptText}`;
    
    // Style params construction
    if (styleAdjustmentType === "sref") {
        line += ` --sref ${activeInfluence.code}`;
        // Apply Style Weight if defined
        if (activeTestCell.styleWeight !== undefined) line += ` --sw ${activeTestCell.styleWeight}`;
        // Apply Stylize Tier
        if (activeTestCell.stylizeTier !== undefined) line += ` --s ${activeTestCell.stylizeTier}`;
    } else {
        // Profile type parameters (assuming personalization code)
         line += ` --p ${activeInfluence.code}`;
         // Apply Stylize Tier for Profile
         if (activeTestCell.stylizeTier !== undefined) line += ` --s ${activeTestCell.stylizeTier}`;
    }
    
    // Global/Set params
    const env = baselineSetDetailQuery.data?.baselineRenderSet?.parameterEnvelope;
    const aspectRatioValue = String(env?.aspectRatio || "").trim();
    const isDefaultAspectRatio = /^1\s*:\s*1$/.test(aspectRatioValue);
    if (aspectRatioValue && !isDefaultAspectRatio) line += ` --ar ${aspectRatioValue}`;
    if (env?.seed) line += ` --seed ${env.seed}`;
    if (env?.quality) line += ` --q ${env.quality}`;
    if (mjModelVersion) line += ` --v ${mjModelVersion}`;

    return line;
  }, [activePromptDefinition, activeInfluence, activeTestCell, styleAdjustmentType, baselineSetDetailQuery.data, mjModelVersion]);

  // Copy Handler
  const handleCopyPrompt = () => {
    if (constructedPrompt) {
        navigator.clipboard.writeText(constructedPrompt);
        // Could show toast here
    }
  };
  
  const submitRunMutation = useMutation({
    mutationFn: async (testImageId: string) => {
        if (!activePromptKey || !activeStyleInfluenceId || !activeInfluence?.code || !activeBaselineItem?.gridImageId || !activeBaselineSetId) {
            throw new Error("Context missing");
        }

        const stylizeTierValue = Number(activeTestCell?.stylizeTier);
        if (!Number.isInteger(stylizeTierValue)) {
            throw new Error("Stylize tier missing or invalid");
        }

        const styleWeightValue = activeTestCell.styleWeight !== undefined && activeTestCell.styleWeight !== null
          ? Number(activeTestCell.styleWeight)
          : undefined;
        if (styleWeightValue !== undefined && !Number.isFinite(styleWeightValue)) {
            throw new Error("Style weight invalid");
        }

        if (styleAdjustmentType === "sref" && styleWeightValue === undefined) {
            throw new Error("Style weight required for sref runs");
        }
        if (styleAdjustmentType === "profile" && styleWeightValue !== undefined) {
            // Keep payload clean for profile runs
            console.warn("Style weight ignored for profile run", { styleWeightValue });
        }
        
        const baselineParams = baselineSetDetailQuery.data?.baselineRenderSet?.parameterEnvelope || {};
        const submittedTestEnvelope: Record<string, any> = {
            mjModelFamily,
            mjModelVersion,
            stylizeTier: stylizeTierValue,
        };

        // Copy locked baseline params to satisfy envelope match
        if (baselineParams.seed !== undefined && baselineParams.seed !== null) submittedTestEnvelope.seed = baselineParams.seed;
        if (baselineParams.quality !== undefined && baselineParams.quality !== null) submittedTestEnvelope.quality = baselineParams.quality;
        if (baselineParams.aspectRatio !== undefined && baselineParams.aspectRatio !== null) submittedTestEnvelope.aspectRatio = baselineParams.aspectRatio;
        if (baselineParams.styleRaw !== undefined && baselineParams.styleRaw !== null) submittedTestEnvelope.styleRaw = baselineParams.styleRaw;

        if (styleAdjustmentType === "sref" && styleWeightValue !== undefined) {
            submittedTestEnvelope.styleWeight = styleWeightValue;
        }

        const payload = {
            promptKey: activePromptKey,
            testGridImageId: testImageId,
            baselineGridImageId: activeBaselineItem.gridImageId,
            baselineRenderSetId: activeBaselineSetId,
            styleInfluenceId: activeStyleInfluenceId,
            styleAdjustmentType,
            styleAdjustmentMidjourneyId: activeInfluence.code,
            stylizeTier: stylizeTierValue,
            submittedTestEnvelope,
        };

        const resp = await fetch("/api/proxy/admin/style-dna/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return parseApiResponse<StyleDnaRunSubmitResponse>(resp);
    },
    onSuccess: (data) => {
        // Run submitted
        setTestFile(null);
        setExistingTestImageId(null);
        setExistingRunContext(null);
        queryClient.invalidateQueries({ queryKey: ["admin", "style-dna", "trait-summary", activeStyleInfluenceId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "style-dna", "runs", activeStyleInfluenceId] });
    }
  });

  const uploadTestImageMutation = useMutation({
    mutationFn: async () => {
        if (!testFile) throw new Error("No test file");
        
        const fileToBase64 = (file: File): Promise<string> => {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1];
                resolve(base64);
              };
              reader.onerror = error => reject(error);
            });
        };

        const base64 = await fileToBase64(testFile);
        
        const payload = {
            fileBase64: base64,
            fileName: testFile.name,
            mimeType: testFile.type,
                        imageKind: "test",
                        provenanceReceipt: buildStyleDnaProvenanceReceipt({
                            imageKind: "test",
                            fileName: testFile.name,
                        }),
        };

        const resp = await fetch("/api/proxy/admin/style-dna/images", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload) 
        });
        return parseApiResponse<StyleDnaImageUploadResponse>(resp);
    },
    onSuccess: (data) => {
        if (data.image?.styleDnaImageId) {
            submitRunMutation.mutate(data.image.styleDnaImageId);
        }
    }
  });

    const runsQuery = useQuery<StyleDnaRunListResponse, ApiRequestError>({
        queryKey: ["admin", "style-dna", "runs", activeStyleInfluenceId, runStatusFilter, runFetchLimit],
        queryFn: async () => {
            if (!activeStyleInfluenceId) throw new Error("No influence");
            const params = new URLSearchParams({
                styleInfluenceId: activeStyleInfluenceId,
                limit: String(runFetchLimit),
            });
            if (runStatusFilter !== "all") {
                params.set("status", runStatusFilter);
            }
            const resp = await fetch(`/api/proxy/admin/style-dna/runs?${params.toString()}`);
            return parseApiResponse<StyleDnaRunListResponse>(resp);
        },
        enabled: !!activeStyleInfluenceId,
        staleTime: 15000,
    });

    const sortedRuns = useMemo(() => {
        const runs = [...(runsQuery.data?.runs || [])];
        return runs.sort((a, b) => {
            const aTs = Date.parse(String(a.createdAt || ""));
            const bTs = Date.parse(String(b.createdAt || ""));
            if (Number.isNaN(aTs) && Number.isNaN(bTs)) return 0;
            if (Number.isNaN(aTs)) return 1;
            if (Number.isNaN(bTs)) return -1;
            return bTs - aTs;
        });
    }, [runsQuery.data]);

    const selectedRunSummary = useMemo(() => {
        if (!selectedRunId) return "";
        const summaryRun = (traitSummaryQuery.data?.summary?.recentRuns || []).find(
            (run) => String(run.styleDnaRunId || "").trim() === selectedRunId
        );
        return String(summaryRun?.summary || "").trim();
    }, [selectedRunId, traitSummaryQuery.data]);

    const selectedRunDetailQuery = useQuery<StyleDnaRunLookupResponse, ApiRequestError>({
        queryKey: ["admin", "style-dna", "runs", "detail", selectedRunId],
        queryFn: async () => {
            if (!selectedRunId) throw new Error("No run selected");
            const resp = await fetch(`/api/proxy/admin/style-dna/runs/${encodeURIComponent(selectedRunId)}`, {
                cache: "no-store",
            });
            return parseApiResponse<StyleDnaRunLookupResponse>(resp);
        },
        enabled: !!selectedRunId,
        staleTime: 10000,
    });

    const selectedRunDetailData = selectedRunDetailQuery.data?.run;
    const selectedRunEnvelope = selectedRunDetailData?.submittedTestEnvelope;
    const selectedRunCanonicalTraits = selectedRunDetailQuery.data?.result?.canonicalTraits;
    const traitSummary = traitSummaryQuery.data?.summary;

    const totalRunPages = useMemo(() => {
        const total = Math.max(1, Math.ceil(sortedRuns.length / runPageSize));
        return total;
    }, [sortedRuns.length]);

    const pagedRuns = useMemo(() => {
        const page = Math.min(Math.max(1, runPage), totalRunPages);
        const start = (page - 1) * runPageSize;
        return sortedRuns.slice(start, start + runPageSize);
    }, [runPage, sortedRuns, totalRunPages]);

    useEffect(() => {
        setRunPage(1);
    }, [runStatusFilter, runFetchLimit, activeStyleInfluenceId]);

    useEffect(() => {
        if (runPage > totalRunPages) {
            setRunPage(totalRunPages);
        }
    }, [runPage, totalRunPages]);

    useEffect(() => {
        if (!activeStyleInfluenceId) {
            setSelectedRunId(null);
            return;
        }
        const runs = sortedRuns;
        if (!runs.length) {
            setSelectedRunId(null);
            return;
        }
        const hasSelected = !!selectedRunId && runs.some((run) => String(run.styleDnaRunId || "").trim() === selectedRunId);
        if (!hasSelected) {
            const firstRunId = String(runs[0]?.styleDnaRunId || "").trim();
            setSelectedRunId(firstRunId || null);
        }
    }, [activeStyleInfluenceId, selectedRunId, sortedRuns]);

    useEffect(() => {
        if (pendingRetryStylizeTier === null) return;
        const match = section3TestCells.find((c) => c.stylizeTier === pendingRetryStylizeTier);
        if (match) {
            setActiveCellId(match.cellId);
            setPendingRetryStylizeTier(null);
        }
    }, [pendingRetryStylizeTier, section3TestCells, setActiveCellId]);

    const prepareRetryFromRun = (run: StyleDnaRun) => {
        const runId = String(run.styleDnaRunId || "").trim();
        const testId = String(run.testGridImageId || "").trim();
        if (!runId || !testId) {
            alert("Run is missing test grid reference; cannot retry.");
            return;
        }
        setSelectedRunId(runId);
        if (run.promptKey) setActivePromptKey(run.promptKey);
        if (run.baselineRenderSetId) setActiveBaselineSetId(run.baselineRenderSetId);
        const type = run.styleAdjustmentType === "profile" ? "profile" : "sref";
        setStyleAdjustmentType(type);
        setPendingRetryStylizeTier(Number(run.stylizeTier || 0));
        setExistingTestImageId(testId);
        setExistingRunContext({
            runId,
            promptKey: run.promptKey,
            baselineRenderSetId: run.baselineRenderSetId,
            stylizeTier: Number(run.stylizeTier || 0),
            styleAdjustmentType: type,
        });
        setTestFile(null);
    };

    const getLoadRetryDisableReason = (run: StyleDnaRun): string | null => {
        if (!String(run.styleDnaRunId || "").trim()) {
            return "Run id is missing.";
        }
        if (!String(run.testGridImageId || "").trim()) {
            return "Test grid reference is missing.";
        }
        if (!String(run.baselineRenderSetId || "").trim()) {
            return "Baseline set reference is missing.";
        }
        if (!String(run.promptKey || "").trim()) {
            return "Prompt key is missing.";
        }
        return null;
    };

    const retryDisableReasons = useMemo(() => {
        const reasons: string[] = [];
        if (!existingTestImageId) reasons.push("Stored test grid is missing.");
        if (!activeStyleInfluenceId) reasons.push("Style influence is not selected.");
        if (!activeInfluence?.code) reasons.push("Style influence code is unavailable.");
        if (!activePromptKey) reasons.push("Prompt key is not selected.");
        if (!activeBaselineSetId) reasons.push("Baseline set is not selected.");
        if (!activeBaselineItem?.gridImageId) reasons.push("Baseline grid is missing for the selected prompt and stylize tier.");
        if (!activeTestCell || !Number.isInteger(Number(activeTestCell.stylizeTier))) {
            reasons.push("Test configuration stylize tier is invalid.");
        }
        if (
            styleAdjustmentType === "sref" &&
            (activeTestCell?.styleWeight === undefined || activeTestCell?.styleWeight === null || !Number.isFinite(Number(activeTestCell.styleWeight)))
        ) {
            reasons.push("Style weight is required for sref retries.");
        }
        if (existingRunContext?.baselineRenderSetId && existingRunContext.baselineRenderSetId !== activeBaselineSetId) {
            reasons.push("Baseline set no longer matches the loaded retry run.");
        }
        return reasons;
    }, [
        existingTestImageId,
        activeStyleInfluenceId,
        activeInfluence,
        activePromptKey,
        activeBaselineSetId,
        activeBaselineItem,
        activeTestCell,
        styleAdjustmentType,
        existingRunContext,
    ]);

    const canSubmitStoredRetry = retryDisableReasons.length === 0;
    const retryDisabledTooltip = canSubmitStoredRetry
        ? "Submit retry with stored test grid"
        : retryDisableReasons.map((reason) => formatActionRequiredCopy(reason)).join(" ");

    const renderStatusBadge = (status?: string) => {
        const value = (status || "").toLowerCase();
        const color = value === "succeeded" ? "bg-green-100 text-green-700" : value === "failed" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700";
        const label = value ? value.replace(/_/g, " ") : "unknown";
        return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${color}`}>{label}</span>;
    };

    const handleExportRunDetailsJson = async () => {
        if (!activeStyleInfluenceId || isExportingRunDetails) return;
        setIsExportingRunDetails(true);
        try {
            const params = new URLSearchParams({
                styleInfluenceId: activeStyleInfluenceId,
                limit: "200",
            });
            const listResp = await fetch(`/api/proxy/admin/style-dna/runs?${params.toString()}`);
            const listData = await parseApiResponse<StyleDnaRunListResponse>(listResp);
            const runIds = (listData.runs || [])
                .map((run) => String(run.styleDnaRunId || "").trim())
                .filter(Boolean);

            const detailResults = await Promise.all(
                runIds.map(async (runId) => {
                    try {
                        const detailResp = await fetch(`/api/proxy/admin/style-dna/runs/${encodeURIComponent(runId)}`, {
                            cache: "no-store",
                        });
                        const detailData = await parseApiResponse<StyleDnaRunLookupResponse>(detailResp);
                        return {
                            runId,
                            run: detailData.run || null,
                            result: detailData.result || null,
                            error: null,
                        };
                    } catch (error: any) {
                        return {
                            runId,
                            run: null,
                            result: null,
                            error: String(error?.message || "Failed to load run detail"),
                        };
                    }
                })
            );

            const exportedAtUtc = new Date().toISOString();
            const payload = {
                styleInfluenceId: activeStyleInfluenceId,
                exportedAtUtc,
                requestedLimit: 200,
                totalRunsListed: runIds.length,
                mayBeTruncatedAtLimit: runIds.length >= 200,
                runDetails: detailResults,
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            const safeInfluenceId = activeStyleInfluenceId.replace(/[^a-zA-Z0-9_-]/g, "_");
            const timestamp = exportedAtUtc.replace(/[:.]/g, "-");
            anchor.href = url;
            anchor.download = `style-dna-runs-${safeInfluenceId}-${timestamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        } catch (error: any) {
            alert(`Failed to export run details JSON: ${error?.message || "Unknown error"}`);
        } finally {
            setIsExportingRunDetails(false);
        }
    };

    const closeNewInfluenceModal = () => {
        setShowNewInfluenceModal(false);
        setNewInfluenceError(null);
        requestAnimationFrame(() => {
            newInfluenceTriggerRef.current?.focus();
        });
    };

    const closeRunDetailModal = () => {
        setIsRunDetailModalOpen(false);
        requestAnimationFrame(() => {
            runDetailTriggerRef.current?.focus();
        });
    };

    useEffect(() => {
        if (!isRunDetailModalOpen) return;
        const timer = window.setTimeout(() => {
            runDetailCloseButtonRef.current?.focus();
        }, 0);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isRunDetailModalOpen) return;
            if (event.key === "Escape") {
                event.preventDefault();
                closeRunDetailModal();
                return;
            }
            if (event.key !== "Tab") return;

            const container = runDetailModalRef.current;
            if (!container) return;
            const focusable = container.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isRunDetailModalOpen]);



  // --- Render ---

  // Build the Header Content
  const headerContent = (
    <div className="flex items-center gap-4 px-6 py-4">
        <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-[var(--ink)]">Style DNA Studio</h1>
            <p className="text-xs text-[var(--muted)]">Workflow Console</p>
        </div>
        <div className="h-8 w-px bg-[var(--line)] mx-2" />
        
        {/* Baseline Set Selector - Context Driver */}
        <label className="flex flex-col text-xs min-w-[280px]">
            <span className="text-gray-500 font-medium mb-1">Baseline Set (Context)</span>
            <select 
                value={activeBaselineSetId || ""} 
                onChange={(e) => setActiveBaselineSetId(e.target.value)}
                className="block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-1.5"
            >
                <option value="">-- Select Baseline Set --</option>
                {(baselineSetListQuery.data?.baselineSets || []).map(set => (
                    <option key={set.baselineRenderSetId} value={set.baselineRenderSetId}>
                         {set.parameterEnvelope?.stylizeTier !== undefined ? `Stylize ${set.parameterEnvelope.stylizeTier}` : 'N/A'} • {set.mjModelFamily} v{set.mjModelVersion} • AR {normalizeAspectRatioValue((set as any)?.parameterEnvelope?.aspectRatio) || 'unspecified'}
                    </option>
                ))}
            </select>
        </label>

        {/* Read-Only Context Display */}
        {baselineSetDetailQuery.data?.baselineRenderSet && (
            <div className="flex items-center gap-3 ml-4 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                <div className="flex flex-col text-[10px] text-gray-500 uppercase tracking-widest leading-none">
                    <span>Config</span>
                    <span>Loaded</span>
                </div>
                <div className="h-full w-px bg-gray-200"></div>
                <div className="text-xs font-mono text-gray-700">
                    <span className="font-bold">--s {stylizeTier}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span>v{mjModelVersion}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span>{mjModelFamily}</span>
                </div>
            </div>
        )}

        <div className="flex-1"></div>

        {/* Link to Baseline Builder (Placeholder) */}
        <button 
            className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            title="Manage Baseline Sets"
            onClick={() => alert("Navigate to Baseline Builder (Coming Soon)")}
        >
            <span>Configure Sets</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </button>
    </div>
  );

    return (
        <>
        <StudioLayout headerContent={headerContent}>
        {/* Sidebar: Prompt Content */}
        <div className="w-[340px] flex-none border-r border-[#E5E7EB] bg-[#F9FAFB] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB]">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Prompt Playlist</h2>
                 <select 
                    className="w-full text-xs rounded border border-gray-300 bg-white p-1.5 focus:ring-1 focus:ring-blue-500"
                    disabled
                >
                    <option>Standard Style DNA Battery v1</option>
                </select>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {baselineSetDetailQuery.isLoading ? (
                    <div className="p-4 text-xs text-gray-500">Loading prompts...</div>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {baselinePromptDefinitions.map((def, idx) => {
                            const isActive = def.promptKey === activePromptKey;
                            // Check if baseline exists (using loaded items)
                            const hasBaseline = baselineSetDetailQuery.data?.items?.some(i => i.promptKey === def.promptKey && i.stylizeTier === Number(stylizeTier));
                            
                            return (
                                <li key={def.promptKey}>
                                    <button
                                        type="button"
                                        onClick={() => setActivePromptKey(def.promptKey)}
                                        className={`
                                            relative w-full p-3 text-left hover:bg-white/50 transition-colors
                                            ${isActive ? "bg-white shadow-sm z-10" : ""}
                                        `}
                                        aria-current={isActive ? "true" : undefined}
                                    >
                                        {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                                        <div className="flex items-center justify-between mb-1 pl-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] bg-gray-200 text-gray-600 px-1 rounded">{idx + 1}</span>
                                                <span className="font-mono text-xs font-semibold text-gray-900">{def.promptKey}</span>
                                            </div>
                                            {hasBaseline && (
                                                <span className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-white" title="Baseline Ready" />
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 line-clamp-2 pl-2 border-l-2 border-transparent">{def.promptText}</p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>

        {/* Main Workspace */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50 p-6 lg:p-7">
            
            {/* Target Selection & Analysis Controls */}
                <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-5">
               <div className="flex items-end justify-between gap-4">
                    <label className="flex flex-col text-xs min-w-[300px] flex-1 max-w-md">
                        <span className="text-gray-500 font-medium mb-1">Style Influence (Target SREF)</span>
                        <select 
                            value={activeStyleInfluenceId || ""} 
                            onChange={(e) => setActiveStyleInfluenceId(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2"
                        >
                            <option value="">-- Select Influence (Target Person/Style) --</option>
                            {availableInfluences.map(inf => (
                                <option key={inf.id} value={inf.id}>{inf.label} ({inf.imageCount} imgs)</option>
                            ))}
                        </select>
                    </label>

                        <button
                            ref={newInfluenceTriggerRef}
                            type="button"
                            onClick={() => {
                                setNewInfluenceError(null);
                                setShowNewInfluenceModal(true);
                            }}
                            className="whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                        >
                            + New Influence
                        </button>

                   {/* Manual Override for Adjustment Type */}
                   <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                        <button
                            onClick={() => setStyleAdjustmentType("sref")}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${styleAdjustmentType === "sref" ? "bg-white text-blue-700 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"}`}
                        >
                            Style Reference (--sref)
                        </button>
                        <button
                            onClick={() => setStyleAdjustmentType("profile")}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${styleAdjustmentType === "profile" ? "bg-white text-purple-700 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"}`}
                        >
                            Profile (--p)
                        </button>
                   </div>
               </div>
               
               <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3" data-testid="trait-summary-panel">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-900">Extracted Traits (Selected Influence)</span>
                        {traitSummaryQuery.isFetching && <span className="text-[10px] text-gray-500">Refreshing…</span>}
                    </div>

                    {!activeStyleInfluenceId && (
                        <p className="text-xs text-gray-500">{formatActionRequiredCopy("Select a style influence to load extracted traits")}</p>
                    )}

                    {activeStyleInfluenceId && traitSummaryQuery.isLoading && (
                        <p className="text-xs text-gray-500">Loading extracted traits…</p>
                    )}

                    {activeStyleInfluenceId && traitSummaryQuery.error && (
                        <p className="text-xs text-red-600">Could not load extracted traits: {(traitSummaryQuery.error as any)?.message || "Unknown error"}</p>
                    )}

                    {activeStyleInfluenceId && !traitSummaryQuery.isLoading && !traitSummaryQuery.error && (
                        <div className="space-y-2 text-xs text-gray-700">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <p><span className="font-semibold text-gray-900">Completed runs:</span> {traitSummary?.completedRunCount ?? 0}</p>
                                <p><span className="font-semibold text-gray-900">Avg delta:</span> {traitSummary?.averageDeltaStrength ?? "-"}</p>
                            </div>

                            <div className="rounded border border-gray-200 bg-white p-2">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Top DNA Tags</p>
                                {(traitSummary?.topDnaTags || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {(traitSummary?.topDnaTags || []).slice(0, 8).map((tag, index) => (
                                            <span key={`dna-${String(tag.value || "unknown")}-${index}`} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                                {tag.value} ({tag.count || 0})
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-gray-500">No extracted DNA tags yet.</p>
                                )}
                            </div>

                            <div className="rounded border border-gray-200 bg-white p-2">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Top Vibe Shifts</p>
                                {(traitSummary?.topVibeShifts || []).length > 0 ? (
                                    <ul className="space-y-1">
                                        {(traitSummary?.topVibeShifts || []).slice(0, 5).map((shift, index) => (
                                            <li key={`vibe-${String(shift.value || "unknown")}-${index}`} className="text-[11px] text-gray-700">{shift.value} ({shift.count || 0})</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-[11px] text-gray-500">No extracted vibe shifts yet.</p>
                                )}
                            </div>

                            <div className="rounded border border-gray-200 bg-white p-2">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Top Atomic Traits</p>
                                {(traitSummary?.topAtomicTraits || []).length > 0 ? (
                                    <ul className="space-y-1">
                                        {(traitSummary?.topAtomicTraits || []).slice(0, 6).map((trait, index) => (
                                            <li key={`atomic-${String(trait.axis || "axis")}-${String(trait.trait || "trait")}-${index}`} className="text-[11px] text-gray-700">
                                                {trait.axis || "axis"}: {trait.trait || "trait"} ({trait.count || 0})
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-[11px] text-gray-500">No extracted atomic traits yet.</p>
                                )}
                            </div>
                        </div>
                    )}
               </div>
               </div>
            </div>


            {/* Split Pane: Source vs Target */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start">
                
                {/* LEFT: SOURCE (Baseline) */}
                <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex min-h-[64px] items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">Source (Baseline)</h3>
                            <p className="text-xs text-gray-500">Stylize: {stylizeTier}</p>
                        </div>
                        {activeBaselineItem && (
                             <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                Ready
                             </span>
                        )}
                    </div>

                    <div className="flex flex-1 flex-col gap-4 bg-gray-50/50 p-5">
                        {/* Current Baseline Image Display */}
                        {activeBaselineItem?.gridImageId ? (
                            <div className="space-y-3">
                                <div
                                    onPaste={(e) => {
                                        const items = e.clipboardData.items;
                                        for (const item of items) {
                                            if (item.type.startsWith('image/')) {
                                                const file = item.getAsFile();
                                                if (file) setBaselineFile(file);
                                            }
                                        }
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsDraggingBaseline(true);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsDraggingBaseline(false);
                                    }}
                                    onDrop={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsDraggingBaseline(false);

                                        const file = e.dataTransfer.files?.[0];
                                        if (file && file.type.startsWith('image/')) {
                                            setBaselineFile(file);
                                            return;
                                        }

                                        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                                        if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                                            try {
                                                const resp = await fetch(url);
                                                const blob = await resp.blob();
                                                if (blob.type.startsWith('image/')) {
                                                    const filename = url.split('/').pop()?.split('?')[0] || `pasted-image-${Date.now()}.png`;
                                                    const convertedFile = new File([blob], filename, { type: blob.type });
                                                    setBaselineFile(convertedFile);
                                                } else {
                                                    alert("URL did not return a valid image.");
                                                }
                                            } catch (err) {
                                                console.error("Failed to fetch image from URL:", err);
                                                alert("Could not fetch image from URL. This may be due to CORS restrictions on the source site.");
                                            }
                                        }
                                    }}
                                    onClick={() => document.getElementById('baseline-upload')?.click()}
                                    className={`relative aspect-square w-full rounded-lg border bg-white overflow-hidden shadow-sm group cursor-pointer transition-all ${isDraggingBaseline ? "border-green-500 bg-green-100 scale-[1.01] shadow-inner" : "border-gray-200 hover:border-green-300"}`}
                                >
                                    <img 
                                        src={styleDnaImageContentPath(activeBaselineItem.gridImageId)} 
                                        className="h-full w-full object-contain"
                                        alt="Baseline Grid"
                                    />
                                    {isDraggingBaseline && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-green-100/85 text-xs font-semibold text-green-700">
                                            Drop to replace baseline
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="px-2 py-1 bg-black/70 text-white text-[10px] rounded">Grid ID: {activeBaselineItem.gridImageId.slice(0,8)}</span>
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-500">Tip: click, paste, or drop an image on the card to replace this baseline.</p>

                                {baselineFile && baselinePreviewUrl ? (
                                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-14 w-14 overflow-hidden rounded border border-green-200 bg-white">
                                                <img src={baselinePreviewUrl} className="h-full w-full object-cover" alt="Replacement baseline preview" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-green-700">Replacement ready</p>
                                                <p className="truncate text-[11px] text-green-700">{baselineFile.name}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={() => uploadBaselineImageMutation.mutate()}
                                                disabled={uploadBaselineImageMutation.isPending}
                                                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {uploadBaselineImageMutation.isPending ? "Uploading..." : "Replace baseline"}
                                            </button>
                                            <button
                                                onClick={() => setBaselineFile(null)}
                                                className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                                        <p className="text-[11px] text-gray-600">Need to replace this baseline image?</p>
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('baseline-upload')?.click()}
                                            className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                                        >
                                            Upload replacement
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div 
                                onPaste={(e) => {
                                    const items = e.clipboardData.items;
                                    for (const item of items) {
                                        if (item.type.startsWith('image/')) {
                                            const file = item.getAsFile();
                                            if (file) setBaselineFile(file);
                                        }
                                    }
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDraggingBaseline(true);
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDraggingBaseline(false);
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDraggingBaseline(false);
                                    
                                    // 1. Check for Files
                                    const file = e.dataTransfer.files?.[0];
                                    if (file && file.type.startsWith('image/')) {
                                        setBaselineFile(file);
                                        return;
                                    }

                                    // 2. Check for URL (cross-browser support)
                                    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                                    if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                                        try {
                                            // Optimistic fetch
                                            const resp = await fetch(url);
                                            const blob = await resp.blob();
                                            if (blob.type.startsWith('image/')) {
                                                const filename = url.split('/').pop()?.split('?')[0] || `pasted-image-${Date.now()}.png`;
                                                const convertedFile = new File([blob], filename, { type: blob.type });
                                                setBaselineFile(convertedFile);
                                            } else {
                                                alert("URL did not return a valid image.");
                                            }
                                        } catch (err) {
                                            console.error("Failed to fetch image from URL:", err);
                                            alert("Could not fetch image from URL. This may be due to CORS restrictions on the source site.");
                                        }
                                    }
                                }}
                                className={`
                                    min-h-[320px] flex flex-col items-center justify-center rounded-lg border-2 border-dashed 
                                    ${baselineFile 
                                        ? "border-green-400 bg-green-50" 
                                        : isDraggingBaseline 
                                            ? "border-green-500 bg-green-100 scale-[1.02] shadow-inner" 
                                            : "border-gray-300 bg-gray-50 hover:bg-gray-100"}
                                    transition-all p-6 text-center cursor-pointer relative
                                `}
                                onClick={() => document.getElementById('baseline-upload')?.click()}
                            >
                                {baselineFile && baselinePreviewUrl ? (
                                    <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                        <div className="h-20 w-20 mx-auto rounded overflow-hidden border border-green-200">
                                            <img src={baselinePreviewUrl} className="h-full w-full object-cover" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-green-700">Image Ready</p>
                                            <p className="text-xs text-green-600 max-w-[200px] truncate mx-auto">{baselineFile.name}</p>
                                        </div>
                                        <div className="flex gap-2 justify-center pt-2">
                                            <button 
                                                onClick={() => uploadBaselineImageMutation.mutate()}
                                                disabled={uploadBaselineImageMutation.isPending}
                                                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 shadow-sm disabled:opacity-50"
                                            >
                                                {uploadBaselineImageMutation.isPending ? "Uploading..." : "Confirm"}
                                            </button>
                                            <button 
                                                onClick={() => setBaselineFile(null)}
                                                className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">Missing Baseline</p>
                                        <p className="text-xs text-gray-500 mt-1 max-w-[200px]">Drag & drop, paste, or click to browse</p>
                                    </>
                                )}
                            </div>
                        )}

                        <input 
                            type="file" 
                            className="hidden" 
                            id="baseline-upload"
                            onChange={(e) => setBaselineFile(e.target.files?.[0] || null)}
                        />
                        
                        {/* Baseline Prompt Info */}
                        {activePromptDefinition && (
                            <div className="min-h-[120px] rounded border border-gray-200 bg-white p-3 space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Prompt Text</span>
                                <div className="text-xs font-mono text-gray-600 break-words leading-relaxed">
                                    {activePromptDefinition.promptText}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: TARGET (Style Influence) */}
                 <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity ${!activeBaselineItem ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                     <div className="flex min-h-[64px] items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                        <div className="flex items-center gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Target (Test)</h3>
                            </div>
                            {activeTestCell?.label && (
                                <span className="text-xs font-medium text-blue-600">{activeTestCell.label}</span>
                            )}
                        </div>
                        <button 
                            onClick={handleCopyPrompt}
                            disabled={!constructedPrompt}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm flex items-center gap-2 group transition-all active:scale-95"
                        >
                            <span>Copy Prompt</span>
                            <kbd className="hidden group-hover:inline-block font-sans bg-blue-700/50 px-1 rounded text-[9px] text-white/80">Cmd+C</kbd>
                        </button>
                    </div>

                    {activeInfluence && (
                        <div className="border-b border-gray-100 bg-white px-5 py-3">
                            <span className="mb-2 block text-xs font-medium text-gray-500">Test Configuration (Step)</span>
                            <div className="flex flex-wrap gap-2">
                                {section3TestCells.map((cell) => (
                                    <button
                                        key={cell.cellId}
                                        onClick={() => setActiveCellId(cell.cellId)}
                                        className={`
                                            group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all
                                            ${activeCellId === cell.cellId
                                                ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"}
                                        `}
                                    >
                                        <span className={`h-2 w-2 rounded-full ${activeCellId === cell.cellId ? "bg-blue-500" : "bg-gray-300 group-hover:bg-gray-400"}`}></span>
                                        {cell.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-1 flex-col gap-4 bg-gray-50/50 p-5">
                        {/* Test Grid Drop Zone */}
                        <div 
                             onPaste={(e) => {
                                const items = e.clipboardData.items;
                                for (const item of items) {
                                    if (item.type.startsWith('image/')) {
                                        const file = item.getAsFile();
                                        if (file) setTestFile(file);
                                    }
                                }
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDraggingTest(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDraggingTest(false);
                            }}
                            onDrop={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDraggingTest(false);
                                
                                const file = e.dataTransfer.files?.[0];
                                if (file && file.type.startsWith('image/')) {
                                    setTestFile(file);
                                    return;
                                }

                                const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                                if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                                    try {
                                        const resp = await fetch(url);
                                        const blob = await resp.blob();
                                        if (blob.type.startsWith('image/')) {
                                            const filename = url.split('/').pop()?.split('?')[0] || `pasted-test-${Date.now()}.png`;
                                            const convertedFile = new File([blob], filename, { type: blob.type });
                                            setTestFile(convertedFile);
                                        } else {
                                            alert("URL did not return a valid image.");
                                        }
                                    } catch (err) {
                                        console.error("Failed to fetch image from URL:", err);
                                        alert("Could not fetch image from URL. This may be due to CORS restrictions on the source site.");
                                    }
                                }
                            }}
                            className={`
                                min-h-[320px] flex flex-col items-center justify-center rounded-lg border-2 border-dashed 
                                ${testFile 
                                    ? "border-blue-400 bg-blue-50" 
                                    : isDraggingTest 
                                        ? "border-blue-500 bg-blue-100 scale-[1.02] shadow-inner" 
                                        : "border-gray-300 bg-gray-50 hover:bg-gray-100"}
                                transition-all p-6 text-center cursor-pointer relative
                            `}
                            tabIndex={0}
                            onClick={() => document.getElementById('test-upload')?.click()}
                        >
                            {testFile ? (
                                <div className="space-y-3 relative z-10" onClick={e => e.stopPropagation()}>
                                    <div className="p-3 bg-blue-100 rounded-full mx-auto w-fit text-blue-600">
                                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-blue-700">Image Ready</p>
                                        <p className="text-xs text-blue-600 truncate max-w-[220px]">{testFile.name}</p>
                                        {testPreviewUrl && (
                                            <div className="mt-3 h-24 w-24 mx-auto rounded overflow-hidden border border-blue-200 bg-white">
                                                <img src={testPreviewUrl} className="h-full w-full object-cover" alt="Test grid preview" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2 justify-center pt-2">
                                        <button 
                                            onClick={() => uploadTestImageMutation.mutate()}
                                            disabled={uploadTestImageMutation.isPending || submitRunMutation.isPending}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm"
                                        >
                                            {uploadTestImageMutation.isPending || submitRunMutation.isPending ? "Processing..." : "Submit DNA Run"}
                                        </button>
                                        <button 
                                            onClick={() => setTestFile(null)}
                                            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {existingTestImageId && (
                                        <div className="w-full rounded border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs text-blue-800 shadow-sm">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold">Using stored test grid</span>
                                                    <span className="text-[11px] text-blue-700">Run {existingRunContext?.runId?.slice(0,8) || "?"} • Test {existingTestImageId.slice(0,8)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div title={retryDisabledTooltip}>
                                                        <button
                                                            onClick={() => existingTestImageId && canSubmitStoredRetry && submitRunMutation.mutate(existingTestImageId)}
                                                            disabled={submitRunMutation.isPending || !canSubmitStoredRetry}
                                                            className="rounded-md bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {submitRunMutation.isPending ? "Submitting..." : "Submit Retry"}
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setExistingTestImageId(null);
                                                            setExistingRunContext(null);
                                                        }}
                                                        className="rounded-md border border-blue-100 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="h-14 w-14 overflow-hidden rounded border border-blue-200 bg-white">
                                                    <img src={styleDnaImageContentPath(existingTestImageId)} className="h-full w-full object-cover" alt="Stored test grid" />
                                                </div>
                                                {existingRunContext?.promptKey && (
                                                    <div className="text-[11px] text-blue-800">
                                                        <div>Prompt {existingRunContext.promptKey}</div>
                                                        <div>Stylize s{existingRunContext.stylizeTier}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">Upload Test Result</p>
                                    <p className="text-xs text-gray-500 mt-1 max-w-[200px]">Drag & drop, paste, or click to browse</p>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        id="test-upload"
                                        onChange={(e) => setTestFile(e.target.files?.[0] || null)}
                                    />
                                </>
                            )}
                        </div>

                        {/* Computed Prompt Display */}
                        <div className="relative min-h-[120px] rounded border border-blue-100 bg-white p-3 shadow-sm group">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-[10px] font-bold text-blue-400 uppercase">Generated Prompt</p>
                                {constructedPrompt && (
                                    <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Click Copy Button above</span>
                                )}
                            </div>
                            <p className={`text-xs font-mono break-words leading-relaxed ${constructedPrompt ? "text-gray-800" : "text-gray-400 italic"}`}>
                                {constructedPrompt || "(Select influence and prompt to generate)"}
                            </p>
                        </div>

                        <div className="rounded border border-gray-200 bg-white p-3 shadow-sm">
                            <div className="space-y-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-gray-900">Run Operations Log</span>
                                        <span className="text-[11px] text-gray-500">Raw run statuses, errors, retries, and selected run detail</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={runStatusFilter}
                                            onChange={(event) => setRunStatusFilter(event.target.value)}
                                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                                            title="Filter runs by status"
                                            data-testid="run-status-filter"
                                        >
                                            <option value="all">All statuses</option>
                                            <option value="queued">Queued</option>
                                            <option value="in_progress">In progress</option>
                                            <option value="succeeded">Succeeded</option>
                                            <option value="failed">Failed</option>
                                        </select>
                                        <select
                                            value={String(runFetchLimit)}
                                            onChange={(event) => setRunFetchLimit(Number(event.target.value) || 50)}
                                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                                            title="Number of recent runs to fetch"
                                            data-testid="run-limit-select"
                                        >
                                            <option value="20">Limit 20</option>
                                            <option value="50">Limit 50</option>
                                            <option value="100">Limit 100</option>
                                            <option value="200">Limit 200</option>
                                        </select>
                                        <button
                                            onClick={() => runsQuery.refetch()}
                                            disabled={runsQuery.isFetching}
                                            className="text-[11px] px-3 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-50"
                                        >
                                            {runsQuery.isFetching ? "Refreshing..." : "Refresh runs"}
                                        </button>
                                        <button
                                            onClick={handleExportRunDetailsJson}
                                            disabled={!activeStyleInfluenceId || isExportingRunDetails}
                                            className="text-[11px] px-3 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            data-testid="export-run-details-json"
                                        >
                                            {isExportingRunDetails ? "Exporting..." : "Export runs JSON"}
                                        </button>
                                    </div>
                                </div>

                                {!activeStyleInfluenceId && (
                                    <p className="text-xs text-gray-500">{formatActionRequiredCopy("Select a style influence to load runs")}</p>
                                )}

                                {activeStyleInfluenceId && runsQuery.isLoading && (
                                    <p className="text-xs text-gray-500">Loading runs…</p>
                                )}

                                {activeStyleInfluenceId && runsQuery.error && (
                                    <p className="text-xs text-red-600">Could not load runs: {(runsQuery.error as any)?.message || "Unknown error"}</p>
                                )}

                                {activeStyleInfluenceId && runsQuery.data && (
                                    <div className="space-y-2">
                                        {selectedRunId && (
                                            <div className="rounded border border-blue-100 bg-blue-50/30 px-3 py-2 text-xs text-gray-800" data-testid="selected-run-details">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <span className="font-semibold text-gray-900">Selected Run Details</span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(event) => {
                                                                runDetailTriggerRef.current = event.currentTarget;
                                                                setIsRunDetailModalOpen(true);
                                                            }}
                                                            disabled={!selectedRunDetailData}
                                                            className="rounded-md border border-blue-100 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                            data-testid="view-run-details"
                                                        >
                                                            View details
                                                        </button>
                                                        <button
                                                            onClick={() => selectedRunDetailQuery.refetch()}
                                                            disabled={selectedRunDetailQuery.isFetching}
                                                            className="rounded-md border border-blue-100 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                                                        >
                                                            {selectedRunDetailQuery.isFetching ? "Refreshing..." : "Refresh result"}
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="mb-2 text-[10px] text-gray-500">
                                                    Summary comes from aggregated trait history; traits/delta come from this run&apos;s lookup payload.
                                                </p>

                                                {selectedRunDetailQuery.isLoading && (
                                                    <p className="text-xs text-gray-600">Loading run detail…</p>
                                                )}

                                                {selectedRunDetailQuery.error && (
                                                    <p className="text-xs text-red-600">Could not load run detail: {(selectedRunDetailQuery.error as any)?.message || "Unknown error"}</p>
                                                )}

                                                {selectedRunDetailQuery.data?.run && (
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-700">
                                                            {renderStatusBadge(selectedRunDetailQuery.data.run.status)}
                                                            <span className="font-mono">{selectedRunDetailQuery.data.run.styleDnaRunId || selectedRunId}</span>
                                                            {selectedRunDetailQuery.data.run.promptKey && (
                                                                <span className="text-gray-600">{selectedRunDetailQuery.data.run.promptKey} • s{selectedRunDetailQuery.data.run.stylizeTier}</span>
                                                            )}
                                                        </div>

                                                        {selectedRunSummary && (
                                                            <p className="rounded border border-blue-100 bg-white px-3 py-2 text-[11px] text-gray-700">
                                                                <span className="font-semibold text-gray-900">Summary:</span> {selectedRunSummary}
                                                            </p>
                                                        )}

                                                        {selectedRunDetailQuery.data.result?.canonicalTraits ? (
                                                            <div className="grid gap-2 rounded border border-blue-100 bg-white px-3 py-2 text-[11px] text-gray-700">
                                                                <p>
                                                                    <span className="font-semibold text-gray-900">Vibe Shift:</span>{" "}
                                                                    {selectedRunDetailQuery.data.result.canonicalTraits.vibeShift || "(none)"}
                                                                </p>
                                                                <p>
                                                                    <span className="font-semibold text-gray-900">DNA Tags:</span>{" "}
                                                                    {(selectedRunDetailQuery.data.result.canonicalTraits.dominantDnaTags || []).join(", ") || "(none)"}
                                                                </p>
                                                                <p>
                                                                    <span className="font-semibold text-gray-900">Delta Strength:</span>{" "}
                                                                    {selectedRunDetailQuery.data.result.canonicalTraits.deltaStrength?.score_1_to_10 ?? "-"}
                                                                    {selectedRunDetailQuery.data.result.canonicalTraits.deltaStrength?.description
                                                                        ? ` (${selectedRunDetailQuery.data.result.canonicalTraits.deltaStrength.description})`
                                                                        : ""}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-gray-600">
                                                                {String(selectedRunDetailQuery.data.run.status || "").toLowerCase() === "failed"
                                                                    ? "Run failed before result payload was persisted."
                                                                    : "No structured result payload available yet for this run."}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {pagedRuns.map((run) => (
                                            <div
                                                key={run.styleDnaRunId}
                                                onClick={() => {
                                                    const runId = String(run.styleDnaRunId || "").trim();
                                                    if (runId) setSelectedRunId(runId);
                                                }}
                                                data-testid="run-row"
                                                data-selected={selectedRunId === String(run.styleDnaRunId || "").trim() ? "true" : "false"}
                                                className={`flex cursor-pointer items-start justify-between gap-3 rounded border px-3 py-2 text-xs text-gray-800 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${selectedRunId === String(run.styleDnaRunId || "").trim() ? "border-blue-200 bg-blue-50/40" : "border-gray-100 bg-white hover:bg-gray-50"}`}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        {renderStatusBadge(run.status)}
                                                        <span className="font-mono text-[11px] text-gray-600">{run.styleDnaRunId?.slice(0,8)}</span>
                                                        <span className="text-gray-500">{run.promptKey} • s{run.stylizeTier}</span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-600">
                                                        <span>{run.createdAt}</span>
                                                        {run.lastErrorMessage && <span className="ml-2 text-red-600">{run.lastErrorMessage}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const loadRetryDisableReason = getLoadRetryDisableReason(run);
                                                        const canLoadRetry = !loadRetryDisableReason;
                                                        return (
                                                            <div title={canLoadRetry ? "Load run context for retry" : formatActionRequiredCopy(loadRetryDisableReason || "Run context is incomplete for retry") }>
                                                                <button
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        if (canLoadRetry) {
                                                                            prepareRetryFromRun(run);
                                                                        }
                                                                    }}
                                                                    disabled={!canLoadRetry}
                                                                    className="rounded-md border border-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    Load for retry
                                                                </button>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        ))}
                                        {(sortedRuns.length ?? 0) === 0 && (
                                            <p className="text-xs text-gray-500">No runs found for this influence.</p>
                                        )}

                                        {(sortedRuns.length ?? 0) > 0 && (
                                            <div className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                                                <span>
                                                    Showing {(runPage - 1) * runPageSize + 1}-{Math.min(runPage * runPageSize, sortedRuns.length)} of {sortedRuns.length}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setRunPage((prev) => Math.max(1, prev - 1))}
                                                        disabled={runPage <= 1}
                                                        className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Prev
                                                    </button>
                                                    <span>Page {runPage} / {totalRunPages}</span>
                                                    <span data-testid="run-page-indicator" className="hidden">{runPage}/{totalRunPages}</span>
                                                    <button
                                                        onClick={() => setRunPage((prev) => Math.min(totalRunPages, prev + 1))}
                                                        disabled={runPage >= totalRunPages}
                                                        className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                        </div>
                            </div>
                    </div>
                </div>

            </div>
        </div>
        </div>

        </StudioLayout>
        <NewInfluenceModal
            open={showNewInfluenceModal}
            initialType={styleAdjustmentType}
            loading={createInfluenceMutation.isPending}
            errorMessage={newInfluenceError}
            onClose={closeNewInfluenceModal}
            onSubmit={(input) => {
                setNewInfluenceError(null);
                createInfluenceMutation.mutate(input);
            }}
        />
        {isRunDetailModalOpen && (
            <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30" onClick={closeRunDetailModal} data-testid="run-detail-modal-overlay">
                <div
                    ref={runDetailModalRef}
                    className="h-full w-full max-w-xl overflow-y-auto border-l border-gray-200 bg-white shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Run Detail"
                    data-testid="run-detail-modal"
                >
                    <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900">Run Detail</span>
                            <span className="text-[11px] text-gray-500">Diagnostics for selected run</span>
                        </div>
                        <button
                            ref={runDetailCloseButtonRef}
                            type="button"
                            onClick={closeRunDetailModal}
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>

                    <div className="space-y-3 px-4 py-4 text-xs text-gray-700">
                        {!selectedRunDetailData && (
                            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">No run selected yet.</p>
                        )}

                        {selectedRunDetailData && (
                            <>
                                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                    <div className="mb-1 flex items-center gap-2">
                                        {renderStatusBadge(selectedRunDetailData.status)}
                                        <span className="max-w-[260px] truncate font-mono text-[11px] text-gray-700" title={selectedRunDetailData.styleDnaRunId || selectedRunId || ""}>{selectedRunDetailData.styleDnaRunId || selectedRunId}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <p className="truncate" title={selectedRunDetailData.promptKey || "-"}><span className="font-semibold text-gray-900">Prompt:</span> {selectedRunDetailData.promptKey || "-"}</p>
                                        <p><span className="font-semibold text-gray-900">Stylize:</span> s{selectedRunDetailData.stylizeTier ?? "-"}</p>
                                        <p className="truncate" title={selectedRunDetailData.styleAdjustmentType || "-"}><span className="font-semibold text-gray-900">Adjustment:</span> {selectedRunDetailData.styleAdjustmentType || "-"}</p>
                                        <p className="truncate" title={selectedRunDetailData.styleAdjustmentMidjourneyId || "-"}><span className="font-semibold text-gray-900">MJ ID:</span> {selectedRunDetailData.styleAdjustmentMidjourneyId || "-"}</p>
                                        <p><span className="font-semibold text-gray-900">Created:</span> {selectedRunDetailData.createdAt || "-"}</p>
                                        <p><span className="font-semibold text-gray-900">Updated:</span> {selectedRunDetailData.updatedAt || "-"}</p>
                                    </div>
                                </div>

                                {(selectedRunDetailData.lastErrorCode || selectedRunDetailData.lastErrorMessage) && (
                                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                                        <p className="truncate" title={selectedRunDetailData.lastErrorCode || "(none)"}><span className="font-semibold">Error code:</span> {selectedRunDetailData.lastErrorCode || "(none)"}</p>
                                        <p className="mt-1"><span className="font-semibold">Error message:</span></p>
                                        <p className="line-clamp-6 whitespace-pre-wrap break-words" title={selectedRunDetailData.lastErrorMessage || "(none)"}>{selectedRunDetailData.lastErrorMessage || "(none)"}</p>
                                    </div>
                                )}

                                {selectedRunSummary && (
                                    <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                                        <span className="font-semibold">Summary:</span> {selectedRunSummary}
                                    </div>
                                )}

                                {selectedRunCanonicalTraits && (
                                    <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-900" data-testid="run-detail-canonical-traits">
                                        <p>
                                            <span className="font-semibold">Vibe Shift:</span>{" "}
                                            {selectedRunCanonicalTraits.vibeShift || "(none)"}
                                        </p>
                                        <p>
                                            <span className="font-semibold">DNA Tags:</span>{" "}
                                            {(selectedRunCanonicalTraits.dominantDnaTags || []).join(", ") || "(none)"}
                                        </p>
                                        <p>
                                            <span className="font-semibold">Delta Strength:</span>{" "}
                                            {selectedRunCanonicalTraits.deltaStrength?.score_1_to_10 ?? "-"}
                                            {selectedRunCanonicalTraits.deltaStrength?.description
                                                ? ` (${selectedRunCanonicalTraits.deltaStrength.description})`
                                                : ""}
                                        </p>
                                    </div>
                                )}

                                <div className="rounded border border-gray-200 bg-white px-3 py-2 text-[11px]">
                                    <p className="mb-2 font-semibold text-gray-900">Image references</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedRunDetailData.baselineGridImageId ? (
                                            <a
                                                href={styleDnaImageContentPath(selectedRunDetailData.baselineGridImageId)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-blue-700 hover:bg-gray-100"
                                            >
                                                Open baseline image
                                            </a>
                                        ) : (
                                            <span className="text-gray-500">Baseline image ref missing</span>
                                        )}
                                        {selectedRunDetailData.testGridImageId ? (
                                            <a
                                                href={styleDnaImageContentPath(selectedRunDetailData.testGridImageId)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-blue-700 hover:bg-gray-100"
                                            >
                                                Open test image
                                            </a>
                                        ) : (
                                            <span className="text-gray-500">Test image ref missing</span>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded border border-gray-200 bg-white px-3 py-2 text-[11px]">
                                    <p className="mb-2 font-semibold text-gray-900">Payload context</p>
                                    <p className="truncate" title={selectedRunDetailData.baselineRenderSetId || "-"}><span className="font-semibold">Baseline set:</span> {selectedRunDetailData.baselineRenderSetId || "-"}</p>
                                    {selectedRunEnvelope ? (
                                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-gray-100 bg-gray-50 p-2 text-[10px] text-gray-700">
{JSON.stringify(selectedRunEnvelope, null, 2)}
                                        </pre>
                                    ) : (
                                        <p className="mt-1 text-gray-500">Submitted test envelope not present for this run payload.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
  );
}
