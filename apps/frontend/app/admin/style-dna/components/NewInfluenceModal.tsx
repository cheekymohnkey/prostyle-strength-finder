"use client";

import React, { useEffect, useRef, useState } from "react";

type InfluenceType = "sref" | "profile";

export interface NewInfluenceModalProps {
  open: boolean;
  initialType?: InfluenceType;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (input: { influenceType: InfluenceType; influenceCode: string }) => void;
  onClose: () => void;
}

export function NewInfluenceModal({
  open,
  initialType = "sref",
  loading = false,
  errorMessage = null,
  onSubmit,
  onClose,
}: NewInfluenceModalProps) {
  const [influenceType, setInfluenceType] = useState<InfluenceType>(initialType);
  const [influenceCode, setInfluenceCode] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setInfluenceType(initialType);
      setInfluenceCode("");
    }
  }, [open, initialType]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      codeInputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = dialogRef.current;
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
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = influenceCode.trim().length > 0 && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        className="w-[420px] rounded-xl bg-white p-6 shadow-xl border border-gray-200"
        role="dialog"
        aria-modal="true"
        aria-label="New Style Influence"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">New Style Influence</h3>
            <p className="text-sm text-gray-500">Create a sref/profile so it is selectable immediately.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col text-sm gap-1">
            <span className="text-gray-600 font-medium">Type</span>
            <select
              value={influenceType}
              onChange={(e) => setInfluenceType(e.target.value as InfluenceType)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="sref">Style Reference (--sref)</option>
              <option value="profile">Profile (--p)</option>
            </select>
          </label>

          <label className="flex flex-col text-sm gap-1">
            <span className="text-gray-600 font-medium">Influence Code</span>
            <input
              ref={codeInputRef}
              type="text"
              value={influenceCode}
              onChange={(e) => setInfluenceCode(e.target.value)}
              placeholder={influenceType === "sref" ? "Enter sref code" : "Enter profile ID"}
              className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">This is the Midjourney sref or profile identifier.</span>
          </label>

          {errorMessage ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={() => canSubmit && onSubmit({ influenceType, influenceCode: influenceCode.trim() })}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 cursor-not-allowed"}`}
            disabled={!canSubmit}
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
