import React from 'react';
import { useStyleStudioStore } from '../store';

export function GlobalToolbar() {
  const { 
    mjModelFamily, setMjModelFamily,
    mjModelVersion, setMjModelVersion,
    stylizeTier, setStylizeTier
  } = useStyleStudioStore();

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4">
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Style DNA Studio</h1>
        <p className="text-xs text-[var(--muted)]">Workflow Console</p>
      </div>

      <div className="h-8 w-px bg-[var(--line)] mx-2" />

      {/* Model Family Selector */}
      <label className="flex flex-col text-xs">
        <span className="mb-0.5 font-medium text-[var(--muted)]">Model Family</span>
        <select 
          value={mjModelFamily}
          onChange={(e) => setMjModelFamily(e.target.value as 'standard' | 'niji')}
          className="rounded border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1 text-sm font-medium"
        >
          <option value="standard">Standard</option>
          <option value="niji">Niji</option>
        </select>
      </label>

      {/* Model Version Selector */}
      <label className="flex flex-col text-xs">
        <span className="mb-0.5 font-medium text-[var(--muted)]">Version</span>
        <select 
          value={mjModelVersion}
          onChange={(e) => setMjModelVersion(e.target.value)}
          className="rounded border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1 text-sm font-medium"
        >
          {mjModelFamily === 'standard' ? (
            <>
              <option value="7">v7</option>
              <option value="6.1">v6.1</option>
              <option value="6">v6</option>
            </>
          ) : (
            <>
              <option value="7">v7 (Niji)</option>
              <option value="6">v6 (Niji)</option>
            </>
          )}
        </select>
      </label>

      {/* Stylize Tier Selector */}
      <label className="flex flex-col text-xs">
        <span className="mb-0.5 font-medium text-[var(--muted)]">Stylize Tier</span>
        <select 
          value={stylizeTier}
          onChange={(e) => setStylizeTier(Number(e.target.value))}
          className="rounded border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1 text-sm font-medium"
        >
          <option value={0}>--s 0 (None)</option>
          <option value={100}>--s 100 (Default)</option>
          <option value={1000}>--s 1000 (Max)</option>
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <div className="rounded bg-sky-50 px-3 py-1 text-xs text-sky-800 border border-sky-200">
          <span className="font-semibold">Context Active:</span> {mjModelFamily} {mjModelVersion} @ s{stylizeTier}
        </div>
      </div>
    </div>
  );
}
