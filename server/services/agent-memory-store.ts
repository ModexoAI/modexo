interface MemoryEntry {
  id: string;
  agentId: string;
  type: "conversation" | "context" | "knowledge" | "preference";
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  importance: number;
}

interface MemoryQuery {
  agentId?: string;
  types?: string[];
  keywords?: string[];
  minImportance?: number;
  limit?: number;
  timeRange?: { start: Date; end: Date };
}

interface MemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  avgImportance: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

const memoryStore: Map<string, MemoryEntry> = new Map();
const agentMemories: Map<string, Set<string>> = new Map();
const typeIndex: Map<string, Set<string>> = new Map();

export function storeMemory(
  agentId: string,
  type: MemoryEntry["type"],
  content: string,
  metadata: Record<string, any> = {},
  importance: number = 0.5
): MemoryEntry {
  const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const entry: MemoryEntry = {
    id,
    agentId,
    type,
    content,
    metadata,
    createdAt: new Date(),
    accessedAt: new Date(),
    accessCount: 0,
    importance: Math.min(Math.max(importance, 0), 1)
  };
  
  memoryStore.set(id, entry);
  
  if (!agentMemories.has(agentId)) {
    agentMemories.set(agentId, new Set());
  }
  agentMemories.get(agentId)!.add(id);
  
  if (!typeIndex.has(type)) {
    typeIndex.set(type, new Set());
  }
  typeIndex.get(type)!.add(id);
  
  return entry;
}

export function getMemory(memoryId: string): MemoryEntry | undefined {
  const entry = memoryStore.get(memoryId);
  if (entry) {
    entry.accessedAt = new Date();
    entry.accessCount++;
  }
  return entry;
}

export function updateMemory(memoryId: string, updates: Partial<MemoryEntry>): boolean {
  const entry = memoryStore.get(memoryId);
  if (!entry) return false;
  
  if (updates.content) entry.content = updates.content;
  if (updates.metadata) entry.metadata = { ...entry.metadata, ...updates.metadata };
  if (updates.importance !== undefined) entry.importance = updates.importance;
  
  entry.accessedAt = new Date();
  return true;
}

export function deleteMemory(memoryId: string): boolean {
  const entry = memoryStore.get(memoryId);
  if (!entry) return false;
  
  memoryStore.delete(memoryId);
  
  const agentSet = agentMemories.get(entry.agentId);
  if (agentSet) agentSet.delete(memoryId);
  
  const typeSet = typeIndex.get(entry.type);
  if (typeSet) typeSet.delete(memoryId);
  
  return true;
}

export function queryMemories(query: MemoryQuery): MemoryEntry[] {
  let results: MemoryEntry[] = [];
  
  if (query.agentId) {
    const agentSet = agentMemories.get(query.agentId);
    if (agentSet) {
      results = Array.from(agentSet)
        .map(id => memoryStore.get(id))
        .filter((e): e is MemoryEntry => e !== undefined);
    }
  } else {
    results = Array.from(memoryStore.values());
  }
  
  if (query.types?.length) {
    results = results.filter(e => query.types!.includes(e.type));
  }
  
  if (query.minImportance !== undefined) {
    results = results.filter(e => e.importance >= query.minImportance!);
  }
  
  if (query.timeRange) {
    results = results.filter(e => 
      e.createdAt >= query.timeRange!.start && 
      e.createdAt <= query.timeRange!.end
    );
  }
  
  if (query.keywords?.length) {
    const lowerKeywords = query.keywords.map(k => k.toLowerCase());
    results = results.filter(e => 
      lowerKeywords.some(k => e.content.toLowerCase().includes(k))
    );
  }
  
  results.sort((a, b) => b.importance - a.importance);
  
  if (query.limit) {
    results = results.slice(0, query.limit);
  }
  
  for (const entry of results) {
    entry.accessedAt = new Date();
    entry.accessCount++;
  }
  
  return results;
}

export function getAgentMemories(agentId: string, limit?: number): MemoryEntry[] {
  return queryMemories({ agentId, limit });
}

export function getRecentMemories(agentId: string, count: number = 10): MemoryEntry[] {
  const memories = getAgentMemories(agentId);
  return memories
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, count);
}

export function getMostAccessedMemories(agentId: string, count: number = 10): MemoryEntry[] {
  const memories = getAgentMemories(agentId);
  return memories
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, count);
}

export function consolidateMemories(agentId: string, type: MemoryEntry["type"]): MemoryEntry | null {
  const memories = queryMemories({ agentId, types: [type] });
  if (memories.length < 2) return null;
  
  const combinedContent = memories
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(m => m.content)
    .join("\n\n");
  
  const avgImportance = memories.reduce((sum, m) => sum + m.importance, 0) / memories.length;
  
  for (const memory of memories) {
    deleteMemory(memory.id);
  }
  
  return storeMemory(agentId, type, combinedContent, { consolidated: true }, avgImportance);
}

export function pruneOldMemories(maxAgeMs: number, minImportance: number = 0.3): number {
  const cutoff = new Date(Date.now() - maxAgeMs);
  let pruned = 0;
  
  for (const [id, entry] of memoryStore.entries()) {
    if (entry.createdAt < cutoff && entry.importance < minImportance) {
      deleteMemory(id);
      pruned++;
    }
  }
  
  return pruned;
}

export function getMemoryStats(): MemoryStats {
  const entries = Array.from(memoryStore.values());
  
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  
  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    byAgent[entry.agentId] = (byAgent[entry.agentId] || 0) + 1;
  }
  
  const avgImportance = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.importance, 0) / entries.length
    : 0;
  
  const sortedByDate = entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  
  return {
    totalEntries: entries.length,
    byType,
    byAgent,
    avgImportance,
    oldestEntry: sortedByDate[0]?.createdAt || null,
    newestEntry: sortedByDate[sortedByDate.length - 1]?.createdAt || null
  };
}

export function clearAgentMemories(agentId: string): number {
  const agentSet = agentMemories.get(agentId);
  if (!agentSet) return 0;
  
  const count = agentSet.size;
  for (const id of agentSet) {
    deleteMemory(id);
  }
  
  return count;
}

export function exportMemories(agentId: string): string {
  const memories = getAgentMemories(agentId);
  return JSON.stringify(memories, null, 2);
}

export function importMemories(agentId: string, data: string): number {
  const memories = JSON.parse(data) as MemoryEntry[];
  let imported = 0;
  
  for (const memory of memories) {
    storeMemory(agentId, memory.type, memory.content, memory.metadata, memory.importance);
    imported++;
  }
  
  return imported;
}
