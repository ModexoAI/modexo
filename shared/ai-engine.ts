const AI_ENGINE_VERSION = "1.0.0";

export interface AIEngineConfig {
  modelVersion: string;
  maxConcurrentTasks: number;
  analysisDepth: "shallow" | "standard" | "deep";
  dataSources: DataSource[];
}

export interface DataSource {
  id: string;
  type: "on_chain" | "market_signal" | "predictive_model" | "social";
  weight: number;
  enabled: boolean;
}

export interface AnalysisResult {
  confidence: number;
  signals: Signal[];
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  reasoning: string[];
}

export interface Signal {
  source: string;
  type: string;
  strength: number;
  timestamp: number;
}

export const DEFAULT_DATA_SOURCES: DataSource[] = [
  { id: "helius", type: "on_chain", weight: 0.35, enabled: true },
  { id: "dexscreener", type: "market_signal", weight: 0.30, enabled: true },
  { id: "polymarket", type: "predictive_model", weight: 0.20, enabled: true },
  { id: "twitter", type: "social", weight: 0.15, enabled: false },
];

export function aggregateSignals(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  const totalStrength = signals.reduce((sum, s) => sum + s.strength, 0);
  return totalStrength / signals.length;
}

export function calculateConfidence(
  signalCount: number,
  agreementRatio: number,
  dataQuality: number
): number {
  const baseConfidence = signalCount > 3 ? 0.7 : 0.5;
  return Math.min(1, baseConfidence * agreementRatio * dataQuality);
}

export function filterSignalsByType(
  signals: Signal[],
  types: DataSource["type"][]
): Signal[] {
  const typeSet = new Set(types);
  return signals.filter(s => typeSet.has(s.type as DataSource["type"]));
}

export function groupSignalsBySource(
  signals: Signal[]
): Map<string, Signal[]> {
  const grouped = new Map<string, Signal[]>();
  
  for (const signal of signals) {
    const existing = grouped.get(signal.source) || [];
    existing.push(signal);
    grouped.set(signal.source, existing);
  }
  
  return grouped;
}

export function getStrongestSignal(signals: Signal[]): Signal | null {
  if (signals.length === 0) return null;
  return signals.reduce((strongest, current) => 
    current.strength > strongest.strength ? current : strongest
  );
}

export function calculateSignalConsensus(signals: Signal[]): number {
  if (signals.length < 2) return 1;
  
  const strengths = signals.map(s => s.strength);
  const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  const variance = strengths.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / strengths.length;
  const stdDev = Math.sqrt(variance);
  
  return Math.max(0, 1 - (stdDev / 0.5));
}

export function mergeDataSources(
  primary: DataSource[],
  secondary: DataSource[]
): DataSource[] {
  const merged = new Map<string, DataSource>();
  
  for (const source of primary) {
    merged.set(source.id, source);
  }
  
  for (const source of secondary) {
    if (!merged.has(source.id)) {
      merged.set(source.id, source);
    }
  }
  
  return Array.from(merged.values());
}
