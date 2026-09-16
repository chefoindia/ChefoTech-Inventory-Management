import { create } from 'zustand';
import type { AiAction } from '@pharmaos/shared';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AiAction[];
  toolsUsed?: string[];
  pending?: boolean;
  error?: boolean;
}

interface AssistantState {
  open: boolean;
  messages: AssistantMessage[];
  /** Text placed in the composer by "Ask AI" buttons; sent automatically when `autoSend`. */
  draft: string;
  autoSend: boolean;
  /** Extra screen facts a page wants to share for the next question (small, already visible). */
  facts: Record<string, string | number | boolean>;
  entity: { type: string; id: string } | null;
  field: string | null;
  setOpen: (open: boolean) => void;
  ask: (question: string, opts?: { autoSend?: boolean; field?: string }) => void;
  setDraft: (draft: string) => void;
  setScreen: (entity: { type: string; id: string } | null, facts?: Record<string, string | number | boolean>) => void;
  push: (m: AssistantMessage) => void;
  update: (id: string, patch: Partial<AssistantMessage>) => void;
  clear: () => void;
}

export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  messages: [],
  draft: '',
  autoSend: false,
  facts: {},
  entity: null,
  field: null,
  setOpen: (open) => set({ open }),
  ask: (question, opts) => set({ open: true, draft: question, autoSend: opts?.autoSend ?? true, field: opts?.field ?? null }),
  setDraft: (draft) => set({ draft, autoSend: false }),
  setScreen: (entity, facts) => set({ entity, facts: facts ?? {} }),
  push: (m) => set((s) => ({ messages: [...s.messages, m].slice(-40) })),
  update: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  clear: () => set({ messages: [] }),
}));
