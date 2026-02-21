"use client";

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

type ApprovalPolicyResponse = {
  policy: {
    approvalMode: "auto-approve" | "manual";
    updatedAt?: string;
  };
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

export default function AdminOperationsPage() {
  const [approvalMode, setApprovalMode] = useState<"auto-approve" | "manual">("auto-approve");
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

  const updatePolicyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/proxy/admin/approval-policy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ approvalMode }),
      });
      return parseApiResponse<ApprovalPolicyResponse>(response);
    },
    onSuccess: (data) => {
      setApprovalMode(data.policy.approvalMode);
      void approvalPolicyQuery.refetch();
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={approvalMode}
            onChange={(event) => setApprovalMode(event.target.value as "auto-approve" | "manual")}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
          >
            <option value="auto-approve">auto-approve</option>
            <option value="manual">manual</option>
          </select>
          <button
            type="button"
            onClick={() => updatePolicyMutation.mutate()}
            disabled={updatePolicyMutation.isPending}
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
        <h2 className="text-lg font-semibold text-[var(--ink)]">2) Contributor Submission</h2>
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
        <h2 className="text-lg font-semibold text-[var(--ink)]">3) Trigger / Retry</h2>
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
        <h2 className="text-lg font-semibold text-[var(--ink)]">4) Submissions</h2>
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
                onClick={() => setSelectedSubmissionId(submission.submissionId)}
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
