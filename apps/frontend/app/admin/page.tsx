"use client";

import { useEffect, useMemo, useState } from "react";
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

type ApprovalPolicyResponse = {
  policy: {
    approvalMode: "auto-approve" | "manual";
    updatedAt?: string;
  };
};

type AdminActionAudit = {
  adminActionAuditId: string;
  adminUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason?: string;
  createdAt?: string;
};

type AdminUser = {
  userId: string;
  role: "admin" | "contributor" | "consumer";
  status: "active" | "disabled";
  createdAt?: string;
  updatedAt?: string;
};

type AdminUsersListResponse = {
  users: AdminUser[];
  page?: {
    limit: number;
    nextCursor: string | null;
  };
};

type AdminUserRoleResponse = {
  user: AdminUser;
  actions: AdminActionAudit[];
};

type AdminUserRoleUpdateResponse = {
  previous: AdminUser;
  user: AdminUser;
  audit: AdminActionAudit | null;
};

type AnalysisJob = {
  jobId: string;
  status?: string;
  moderationStatus?: "none" | "flagged" | "removed";
  rerunOfJobId?: string | null;
  runType?: string;
  imageId?: string;
  idempotencyKey?: string;
  submittedAt?: string;
  modelFamily?: string | null;
  modelVersion?: string | null;
  modelSelectionSource?: string | null;
};

type AnalysisRun = {
  analysisRunId: string;
  jobId: string;
  status: string;
  attemptCount: number;
  startedAt?: string | null;
  completedAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  modelFamily?: string | null;
  modelVersion?: string | null;
};

type AnalysisModerationResponse = {
  job: AnalysisJob;
  latestRun: AnalysisRun | null;
  rerunJobs: AnalysisJob[];
  actions: AdminActionAudit[];
};

type AnalysisModerationMutationResponse = {
  job: AnalysisJob;
  rerunJob: AnalysisJob | null;
  audit: AdminActionAudit | null;
  cache?: unknown;
};

type PromptRecord = {
  promptId: string;
  promptText: string;
  status: "active" | "deprecated" | "experimental";
  version?: number | null;
  curated?: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
};

type PromptCurationResponse = {
  prompt: PromptRecord;
  actions: AdminActionAudit[];
};

type PromptCurationMutationResponse = {
  prompt: PromptRecord;
  audit: AdminActionAudit | null;
  cache?: unknown;
};

type ContributorSubmission = {
  submissionId: string;
  ownerUserId?: string;
  styleInfluenceId?: string;
  sourceImageId?: string;
  status?: string;
  lastJobId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ContributorListResponse = {
  submissions: ContributorSubmission[];
};

type ContributorSubmissionResponse = {
  submission: ContributorSubmission;
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

async function fetchSessionState(): Promise<SessionStateResponse> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<SessionStateResponse>(response);
}

async function fetchApprovalPolicy(): Promise<ApprovalPolicyResponse> {
  const response = await fetch("/api/proxy/admin/approval-policy", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<ApprovalPolicyResponse>(response);
}

async function fetchContributorSubmissions(): Promise<ContributorListResponse> {
  const response = await fetch("/api/proxy/contributor/submissions", {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<ContributorListResponse>(response);
}

async function fetchAdminUsers(input: {
  role: string;
  status: string;
  query: string;
  limit: number;
  cursor: string;
}): Promise<AdminUsersListResponse> {
  const params = new URLSearchParams();
  if (input.role.trim()) {
    params.set("role", input.role.trim());
  }
  if (input.status.trim()) {
    params.set("status", input.status.trim());
  }
  if (input.query.trim()) {
    params.set("q", input.query.trim());
  }
  params.set("limit", String(input.limit));
  if (input.cursor.trim()) {
    params.set("cursor", input.cursor.trim());
  }

  const response = await fetch(`/api/proxy/admin/users?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseApiResponse<AdminUsersListResponse>(response);
}

async function fetchAdminUserRole(userId: string): Promise<AdminUserRoleResponse> {
  const response = await fetch(
    `/api/proxy/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  return parseApiResponse<AdminUserRoleResponse>(response);
}

async function fetchAnalysisModeration(jobId: string): Promise<AnalysisModerationResponse> {
  const response = await fetch(
    `/api/proxy/admin/analysis-jobs/${encodeURIComponent(jobId)}/moderation`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  return parseApiResponse<AnalysisModerationResponse>(response);
}

async function fetchPromptCuration(promptId: string): Promise<PromptCurationResponse> {
  const response = await fetch(
    `/api/proxy/admin/prompts/${encodeURIComponent(promptId)}/curation`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  return parseApiResponse<PromptCurationResponse>(response);
}

export default function AdminOperationsPage() {
  const [approvalMode, setApprovalMode] = useState<"auto-approve" | "manual">("auto-approve");
  const [approvalReason, setApprovalReason] = useState("manual policy adjustment");

  const [userRoleFilter, setUserRoleFilter] = useState<"" | "admin" | "contributor" | "consumer">("");
  const [userStatusFilter, setUserStatusFilter] = useState<"" | "active" | "disabled">("");
  const [userSearchQuery, setUserSearchQuery] = useState("role-mgmt");
  const [usersLimit, setUsersLimit] = useState(20);
  const [usersCursor, setUsersCursor] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [targetRole, setTargetRole] = useState<"admin" | "contributor" | "consumer">("consumer");
  const [targetStatus, setTargetStatus] = useState<"active" | "disabled">("active");
  const [roleUpdateReason, setRoleUpdateReason] = useState("operations update");

  const [moderationJobId, setModerationJobId] = useState("");
  const [moderationAction, setModerationAction] = useState<"flag" | "remove" | "re-run">("flag");
  const [moderationReason, setModerationReason] = useState("quality review");

  const [curationPromptId, setCurationPromptId] = useState("");
  const [curationStatus, setCurationStatus] = useState<"active" | "deprecated" | "experimental">("active");
  const [curationReason, setCurationReason] = useState("prompt lifecycle update");

  const [influenceType, setInfluenceType] = useState<"profile" | "sref">("profile");
  const [influenceCode, setInfluenceCode] = useState("");
  const [sourceImageId, setSourceImageId] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [promptText, setPromptText] = useState("portrait study --v 6");

  const sessionStateQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSessionState,
    refetchInterval: 30_000,
  });

  const approvalPolicyQuery = useQuery({
    queryKey: ["admin", "approval-policy"],
    queryFn: fetchApprovalPolicy,
  });

  const contributorListQuery = useQuery({
    queryKey: ["contributor", "submissions"],
    queryFn: fetchContributorSubmissions,
  });

  const adminUsersQuery = useQuery({
    queryKey: [
      "admin",
      "users",
      userRoleFilter,
      userStatusFilter,
      userSearchQuery.trim(),
      usersLimit,
      usersCursor.trim(),
    ],
    queryFn: () =>
      fetchAdminUsers({
        role: userRoleFilter,
        status: userStatusFilter,
        query: userSearchQuery,
        limit: usersLimit,
        cursor: usersCursor,
      }),
  });

  const selectedUserRoleQuery = useQuery({
    queryKey: ["admin", "user-role", selectedUserId.trim()],
    queryFn: () => fetchAdminUserRole(selectedUserId.trim()),
    enabled: selectedUserId.trim() !== "",
  });

  const moderationQuery = useQuery({
    queryKey: ["admin", "analysis-moderation", moderationJobId.trim()],
    queryFn: () => fetchAnalysisModeration(moderationJobId.trim()),
    enabled: moderationJobId.trim() !== "",
  });

  const promptCurationQuery = useQuery({
    queryKey: ["admin", "prompt-curation", curationPromptId.trim()],
    queryFn: () => fetchPromptCuration(curationPromptId.trim()),
    enabled: curationPromptId.trim() !== "",
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/approval-policy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          approvalMode,
          reason: approvalReason.trim(),
        }),
      });
      return parseApiResponse<ApprovalPolicyResponse>(response);
    },
    onSuccess: (data) => {
      setApprovalMode(data.policy.approvalMode);
      void approvalPolicyQuery.refetch();
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId.trim()) {
        throw new Error("Select a user id first");
      }
      if (!roleUpdateReason.trim()) {
        throw new Error("Role update reason is required");
      }
      const response = await fetch(
        `/api/proxy/admin/users/${encodeURIComponent(selectedUserId.trim())}/role`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            role: targetRole,
            status: targetStatus,
            reason: roleUpdateReason.trim(),
          }),
        }
      );
      return parseApiResponse<AdminUserRoleUpdateResponse>(response);
    },
    onSuccess: () => {
      void adminUsersQuery.refetch();
      void selectedUserRoleQuery.refetch();
    },
  });

  const updateModerationMutation = useMutation({
    mutationFn: async () => {
      if (!moderationJobId.trim()) {
        throw new Error("Analysis job id is required");
      }
      if (!moderationReason.trim()) {
        throw new Error("Moderation reason is required");
      }
      const response = await fetch(
        `/api/proxy/admin/analysis-jobs/${encodeURIComponent(moderationJobId.trim())}/moderation`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: moderationAction,
            reason: moderationReason.trim(),
          }),
        }
      );
      return parseApiResponse<AnalysisModerationMutationResponse>(response);
    },
    onSuccess: () => {
      void moderationQuery.refetch();
      void contributorListQuery.refetch();
    },
  });

  const updatePromptCurationMutation = useMutation({
    mutationFn: async () => {
      if (!curationPromptId.trim()) {
        throw new Error("Prompt id is required");
      }
      if (!curationReason.trim()) {
        throw new Error("Curation reason is required");
      }
      const response = await fetch(
        `/api/proxy/admin/prompts/${encodeURIComponent(curationPromptId.trim())}/curation`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            status: curationStatus,
            reason: curationReason.trim(),
          }),
        }
      );
      return parseApiResponse<PromptCurationMutationResponse>(response);
    },
    onSuccess: () => {
      void promptCurationQuery.refetch();
    },
  });

  const createSubmissionMutation = useMutation({
    mutationFn: async () => {
      if (!influenceCode.trim()) {
        throw new Error("Influence code is required");
      }
      if (!sourceImageId.trim()) {
        throw new Error("Source image id is required");
      }
      const response = await fetch("/api/proxy/contributor/submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          influenceType,
          influenceCode: influenceCode.trim(),
          sourceImageId: sourceImageId.trim(),
        }),
      });
      return parseApiResponse<ContributorSubmissionResponse>(response);
    },
    onSuccess: (data) => {
      setSelectedSubmissionId(data.submission.submissionId);
      void contributorListQuery.refetch();
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubmissionId.trim()) {
        throw new Error("Select a submission id first");
      }
      if (!promptText.trim()) {
        throw new Error("Prompt text is required");
      }
      const response = await fetch(
        `/api/proxy/contributor/submissions/${encodeURIComponent(selectedSubmissionId.trim())}/trigger`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ promptText: promptText.trim() }),
        }
      );
      return parseApiResponse<ContributorSubmissionResponse>(response);
    },
    onSuccess: () => {
      void contributorListQuery.refetch();
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubmissionId.trim()) {
        throw new Error("Select a submission id first");
      }
      if (!promptText.trim()) {
        throw new Error("Prompt text is required");
      }
      const response = await fetch(
        `/api/proxy/contributor/submissions/${encodeURIComponent(selectedSubmissionId.trim())}/retry`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ promptText: promptText.trim() }),
        }
      );
      return parseApiResponse<ContributorSubmissionResponse>(response);
    },
    onSuccess: () => {
      void contributorListQuery.refetch();
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

  const submissions = contributorListQuery.data?.submissions || [];
  const users = adminUsersQuery.data?.users || [];
  const nextUsersCursor = adminUsersQuery.data?.page?.nextCursor || "";

  useEffect(() => {
    const selected = selectedUserRoleQuery.data?.user;
    if (!selected) {
      return;
    }
    setTargetRole(selected.role);
    setTargetStatus(selected.status);
  }, [selectedUserRoleQuery.data?.user?.role, selectedUserRoleQuery.data?.user?.status]);

  useEffect(() => {
    if (selectedUserId.trim()) {
      return;
    }
    const firstUser = users[0];
    if (!firstUser) {
      return;
    }
    setSelectedUserId(firstUser.userId);
  }, [selectedUserId, users]);

  useEffect(() => {
    const prompt = promptCurationQuery.data?.prompt;
    if (!prompt) {
      return;
    }
    setCurationStatus(prompt.status);
  }, [promptCurationQuery.data?.prompt?.status]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-6 md:p-10">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          UI Upgrade - U5 Admin + Contributor Essentials
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Operations Console
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Approval policy controls and contributor submission lifecycle actions via Next.js proxy routes.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]">
            Back to Recommendation Flow
          </a>
          <a href="/admin/style-dna" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]">
            Open Style-DNA Console
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
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">1) Approval Policy</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Approval Mode
            <select
              value={approvalMode}
              onChange={(event) => setApprovalMode(event.target.value as "auto-approve" | "manual")}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="auto-approve">auto-approve</option>
              <option value="manual">manual</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Change Reason
            <input
              type="text"
              value={approvalReason}
              onChange={(event) => setApprovalReason(event.target.value)}
              placeholder="required by admin audit policy"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => updatePolicyMutation.mutate()}
            disabled={updatePolicyMutation.isPending || !approvalReason.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {updatePolicyMutation.isPending ? "Saving..." : "Update Policy"}
          </button>
          <button
            type="button"
            onClick={() => approvalPolicyQuery.refetch()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Refresh Policy
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Current:{" "}
          <span className="font-medium text-[var(--ink)]">
            {approvalPolicyQuery.data?.policy?.approvalMode || "(unknown)"}
          </span>
        </p>
        {updatePolicyMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(updatePolicyMutation.error as Error).message}</p>
        ) : null}
        {approvalPolicyQuery.isError ? (
          <p className="mt-2 text-sm text-red-700">{(approvalPolicyQuery.error as Error).message}</p>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">2) User Role Management</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Role Filter
            <select
              value={userRoleFilter}
              onChange={(event) => {
                setUsersCursor("");
                setUserRoleFilter(event.target.value as "" | "admin" | "contributor" | "consumer");
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">all</option>
              <option value="admin">admin</option>
              <option value="contributor">contributor</option>
              <option value="consumer">consumer</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Status Filter
            <select
              value={userStatusFilter}
              onChange={(event) => {
                setUsersCursor("");
                setUserStatusFilter(event.target.value as "" | "active" | "disabled");
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">all</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-2">
            Search Query
            <input
              type="text"
              value={userSearchQuery}
              onChange={(event) => {
                setUsersCursor("");
                setUserSearchQuery(event.target.value);
              }}
              placeholder="user id search"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={usersLimit}
            onChange={(event) => {
              setUsersCursor("");
              setUsersLimit(Number.parseInt(event.target.value, 10));
            }}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
          >
            <option value={20}>limit: 20</option>
            <option value={50}>limit: 50</option>
            <option value={100}>limit: 100</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setUsersCursor("");
              void adminUsersQuery.refetch();
            }}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Refresh Users
          </button>
          <button
            type="button"
            onClick={() => setUsersCursor("")}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            First Page
          </button>
          <button
            type="button"
            onClick={() => setUsersCursor(nextUsersCursor)}
            disabled={!nextUsersCursor}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
          >
            Next Page
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">Users</p>
            {adminUsersQuery.isError ? (
              <p className="mt-2 text-sm text-red-700">{(adminUsersQuery.error as Error).message}</p>
            ) : null}
            <div className="mt-3 grid gap-2">
              {users.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No users found for current filters.</p>
              ) : (
                users.map((user) => (
                  <button
                    key={user.userId}
                    type="button"
                    onClick={() => setSelectedUserId(user.userId)}
                    className="rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--primary)]"
                  >
                    <p className="text-sm font-medium text-[var(--ink)]">{user.userId}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      role: <span className="text-[var(--ink)]">{user.role}</span>
                      {" "} | status: <span className="text-[var(--ink)]">{user.status}</span>
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">Selected User Update</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              User: <span className="text-[var(--ink)]">{selectedUserId || "(none selected)"}</span>
            </p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm text-[var(--muted)]">
                Role
                <select
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value as "admin" | "contributor" | "consumer")}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
                >
                  <option value="admin">admin</option>
                  <option value="contributor">contributor</option>
                  <option value="consumer">consumer</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-[var(--muted)]">
                Status
                <select
                  value={targetStatus}
                  onChange={(event) => setTargetStatus(event.target.value as "active" | "disabled")}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-[var(--muted)]">
                Reason
                <input
                  type="text"
                  value={roleUpdateReason}
                  onChange={(event) => setRoleUpdateReason(event.target.value)}
                  placeholder="required by admin audit policy"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateUserRoleMutation.mutate()}
                disabled={updateUserRoleMutation.isPending || !selectedUserId.trim() || !roleUpdateReason.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {updateUserRoleMutation.isPending ? "Updating..." : "Update User Role"}
              </button>
              <button
                type="button"
                onClick={() => selectedUserRoleQuery.refetch()}
                disabled={!selectedUserId.trim()}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
              >
                Refresh Audit
              </button>
            </div>
            {updateUserRoleMutation.isError ? (
              <p className="mt-2 text-sm text-red-700">{(updateUserRoleMutation.error as Error).message}</p>
            ) : null}
            {selectedUserRoleQuery.isError ? (
              <p className="mt-2 text-sm text-red-700">{(selectedUserRoleQuery.error as Error).message}</p>
            ) : null}
            <div className="mt-4 grid gap-2">
              {(selectedUserRoleQuery.data?.actions || []).slice(0, 5).map((action) => (
                <div key={action.adminActionAuditId} className="rounded-lg border border-[var(--line)] p-2">
                  <p className="text-xs font-medium text-[var(--ink)]">{action.actionType}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    reason: <span className="text-[var(--ink)]">{action.reason || "(none)"}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">3) Analysis Moderation</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-3">
            Analysis Job Id
            <input
              type="text"
              value={moderationJobId}
              onChange={(event) => setModerationJobId(event.target.value)}
              placeholder="job_..."
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Action
            <select
              value={moderationAction}
              onChange={(event) => setModerationAction(event.target.value as "flag" | "remove" | "re-run")}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="flag">flag</option>
              <option value="remove">remove</option>
              <option value="re-run">re-run</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-2">
            Reason
            <input
              type="text"
              value={moderationReason}
              onChange={(event) => setModerationReason(event.target.value)}
              placeholder="required by moderation audit policy"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => updateModerationMutation.mutate()}
            disabled={updateModerationMutation.isPending || !moderationJobId.trim() || !moderationReason.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {updateModerationMutation.isPending ? "Applying..." : "Apply Moderation"}
          </button>
          <button
            type="button"
            onClick={() => moderationQuery.refetch()}
            disabled={!moderationJobId.trim()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
          >
            Refresh Moderation
          </button>
        </div>
        {updateModerationMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(updateModerationMutation.error as Error).message}</p>
        ) : null}
        {moderationQuery.isError ? (
          <p className="mt-2 text-sm text-red-700">{(moderationQuery.error as Error).message}</p>
        ) : null}
        {moderationQuery.data ? (
          <div className="mt-4 rounded-xl border border-[var(--line)] p-4">
            <p className="text-sm text-[var(--muted)]">
              status: <span className="text-[var(--ink)]">{moderationQuery.data.job.status || "(unknown)"}</span>
              {" "} | moderation: <span className="text-[var(--ink)]">{moderationQuery.data.job.moderationStatus || "(unknown)"}</span>
              {" "} | reruns: <span className="text-[var(--ink)]">{moderationQuery.data.rerunJobs.length}</span>
            </p>
            <div className="mt-3 grid gap-2">
              {moderationQuery.data.actions.slice(0, 5).map((action) => (
                <div key={action.adminActionAuditId} className="rounded-lg border border-[var(--line)] p-2">
                  <p className="text-xs font-medium text-[var(--ink)]">{action.actionType}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    reason: <span className="text-[var(--ink)]">{action.reason || "(none)"}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">4) Prompt Curation</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-3">
            Prompt Id
            <input
              type="text"
              value={curationPromptId}
              onChange={(event) => setCurationPromptId(event.target.value)}
              placeholder="pmt_..."
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Status
            <select
              value={curationStatus}
              onChange={(event) => setCurationStatus(event.target.value as "active" | "deprecated" | "experimental")}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="active">active</option>
              <option value="deprecated">deprecated</option>
              <option value="experimental">experimental</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-2">
            Reason
            <input
              type="text"
              value={curationReason}
              onChange={(event) => setCurationReason(event.target.value)}
              placeholder="required by prompt curation audit policy"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => updatePromptCurationMutation.mutate()}
            disabled={updatePromptCurationMutation.isPending || !curationPromptId.trim() || !curationReason.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {updatePromptCurationMutation.isPending ? "Saving..." : "Update Prompt Status"}
          </button>
          <button
            type="button"
            onClick={() => promptCurationQuery.refetch()}
            disabled={!curationPromptId.trim()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
          >
            Refresh Prompt
          </button>
        </div>
        {updatePromptCurationMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(updatePromptCurationMutation.error as Error).message}</p>
        ) : null}
        {promptCurationQuery.isError ? (
          <p className="mt-2 text-sm text-red-700">{(promptCurationQuery.error as Error).message}</p>
        ) : null}
        {promptCurationQuery.data ? (
          <div className="mt-4 rounded-xl border border-[var(--line)] p-4">
            <p className="text-sm text-[var(--muted)]">
              status: <span className="text-[var(--ink)]">{promptCurationQuery.data.prompt.status}</span>
              {" "} | version: <span className="text-[var(--ink)]">{promptCurationQuery.data.prompt.version ?? "(none)"}</span>
            </p>
            <p className="mt-2 text-sm text-[var(--ink)]">{promptCurationQuery.data.prompt.promptText}</p>
            <div className="mt-3 grid gap-2">
              {promptCurationQuery.data.actions.slice(0, 5).map((action) => (
                <div key={action.adminActionAuditId} className="rounded-lg border border-[var(--line)] p-2">
                  <p className="text-xs font-medium text-[var(--ink)]">{action.actionType}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    reason: <span className="text-[var(--ink)]">{action.reason || "(none)"}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">5) Contributor Submission</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Influence Type
            <select
              value={influenceType}
              onChange={(event) => setInfluenceType(event.target.value as "profile" | "sref")}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="profile">profile</option>
              <option value="sref">sref</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Influence Code
            <input
              type="text"
              value={influenceCode}
              onChange={(event) => setInfluenceCode(event.target.value)}
              placeholder="profile-my-test"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)] md:col-span-2">
            Source Image Id
            <input
              type="text"
              value={sourceImageId}
              onChange={(event) => setSourceImageId(event.target.value)}
              placeholder="img_..."
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => createSubmissionMutation.mutate()}
            disabled={createSubmissionMutation.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {createSubmissionMutation.isPending ? "Creating..." : "Create Submission"}
          </button>
          <button
            type="button"
            onClick={() => contributorListQuery.refetch()}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Refresh List
          </button>
        </div>
        {createSubmissionMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(createSubmissionMutation.error as Error).message}</p>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">6) Trigger / Retry</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Submission Id
            <input
              type="text"
              value={selectedSubmissionId}
              onChange={(event) => setSelectedSubmissionId(event.target.value)}
              placeholder="csub_..."
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="grid gap-1 text-sm text-[var(--muted)]">
            Prompt Text
            <input
              type="text"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {triggerMutation.isPending ? "Triggering..." : "Trigger"}
          </button>
          <button
            type="button"
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
          >
            {retryMutation.isPending ? "Retrying..." : "Retry"}
          </button>
        </div>
        {triggerMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(triggerMutation.error as Error).message}</p>
        ) : null}
        {retryMutation.isError ? (
          <p className="mt-2 text-sm text-red-700">{(retryMutation.error as Error).message}</p>
        ) : null}
      </section>

      <section className="mt-6 mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">7) Submissions</h2>
        {contributorListQuery.isError ? (
          <p className="mt-2 text-sm text-red-700">{(contributorListQuery.error as Error).message}</p>
        ) : null}
        <div className="mt-4 grid gap-3">
          {submissions.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No submissions found.</p>
          ) : (
            submissions.map((submission) => (
              <button
                key={submission.submissionId}
                type="button"
                onClick={() => {
                  setSelectedSubmissionId(submission.submissionId);
                  if (submission.lastJobId) {
                    setModerationJobId(submission.lastJobId);
                  }
                }}
                className="rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--primary)]"
              >
                <p className="text-sm font-medium text-[var(--ink)]">
                  {submission.submissionId}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  status: <span className="text-[var(--ink)]">{submission.status || "(unknown)"}</span>
                  {" "} | last job: <span className="text-[var(--ink)]">{submission.lastJobId || "(none)"}</span>
                </p>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
