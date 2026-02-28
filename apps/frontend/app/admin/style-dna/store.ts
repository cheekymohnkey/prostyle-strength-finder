import { create } from 'zustand';

export type MjModelFamily = 'standard' | 'niji';

export interface StyleStudioState {
  // Global Context
  mjModelFamily: MjModelFamily;
  mjModelVersion: string;
  stylizeTier: number;
  activeBaselineSetId: string | null;
  
  // Selection State
  activePromptKey: string | null;
  activeStyleInfluenceId: string | null;
  
  // Actions
  setMjModelFamily: (family: MjModelFamily) => void;
  setMjModelVersion: (version: string) => void;
  setStylizeTier: (tier: number) => void;
  setActiveBaselineSetId: (id: string | null) => void;
  setActivePromptKey: (key: string | null) => void;
  setActiveStyleInfluenceId: (id: string | null) => void;
}

export const useStyleStudioStore = create<StyleStudioState>((set) => ({
  // Defaults from technical decisions
  mjModelFamily: 'standard',
  mjModelVersion: '7', 
  activeBaselineSetId: null,
  stylizeTier: 100,
  
  activePromptKey: null,
  activeStyleInfluenceId: null,

  setMjModelFamily: (family) => set({ mjModelFamily: family, mjModelVersion: '7' }),
  setMjModelVersion: (version) => set({ mjModelVersion: version }),
  setStylizeTier: (tier) => set({ stylizeTier: tier }),
  setActiveBaselineSetId: (id) => set({ activeBaselineSetId: id }),
  setActivePromptKey: (key) => set({ activePromptKey: key }),
  setActiveStyleInfluenceId: (id) => set({ activeStyleInfluenceId: id }),
}));
