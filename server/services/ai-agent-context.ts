import type { Signal } from "@shared/ai-engine";

const CONTEXT_TTL_MS = 1800000;
const MAX_CONTEXT_SIZE = 50;

interface AgentContext {
  agentId: string;
  tokenAddress: string;
  signals: Signal[];
  metadata: Record<string, string>;
  createdAt: number;
}

const contextStore = new Map<string, AgentContext>();

export function createContext(
  agentId: string,
  tokenAddress: string,
  signals: Signal[] = []
): string {
  const contextId = `ctx_${agentId}_${Date.now()}`;
  
  contextStore.set(contextId, {
    agentId,
    tokenAddress,
    signals,
    metadata: {},
    createdAt: Date.now(),
  });

  if (contextStore.size > MAX_CONTEXT_SIZE) {
    pruneOldContexts();
  }

  return contextId;
}

export function getContext(contextId: string): AgentContext | null {
  const ctx = contextStore.get(contextId);
  if (!ctx) return null;
  
  if (Date.now() - ctx.createdAt > CONTEXT_TTL_MS) {
    contextStore.delete(contextId);
    return null;
  }
  
  return ctx;
}

function pruneOldContexts(): void {
  const now = Date.now();
  for (const [id, ctx] of contextStore.entries()) {
    if (now - ctx.createdAt > CONTEXT_TTL_MS) {
      contextStore.delete(id);
    }
  }
}
