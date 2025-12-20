import type { AIEngineConfig, AnalysisResult, Signal, DataSource } from "@shared/ai-engine";
import { aggregateSignals, calculateConfidence, DEFAULT_DATA_SOURCES } from "@shared/ai-engine";

const AI_BRAIN_VERSION = "1.2.0";
const MAX_SIGNAL_AGE_MS = 300000;
const SIGNAL_DECAY_RATE = 0.15;
const MIN_SIGNALS_FOR_ANALYSIS = 2;
const BATCH_SIZE = 50;
const PARALLEL_ANALYSIS_LIMIT = 5;

interface AnalysisQueue {
  pending: string[];
  inProgress: Set<string>;
  completed: Map<string, AnalysisResult>;
  failed: Map<string, string>;
}

function createAnalysisQueue(): AnalysisQueue {
  return {
    pending: [],
    inProgress: new Set(),
    completed: new Map(),
    failed: new Map(),
  };
}

function addToQueue(queue: AnalysisQueue, tokenAddresses: string[]): void {
  for (const address of tokenAddresses) {
    if (!queue.inProgress.has(address) && !queue.completed.has(address)) {
      queue.pending.push(address);
    }
  }
}

function getNextBatch(queue: AnalysisQueue, batchSize: number): string[] {
  const available = batchSize - queue.inProgress.size;
  if (available <= 0) return [];
  
  const batch = queue.pending.splice(0, available);
  batch.forEach(addr => queue.inProgress.add(addr));
  return batch;
}

function markComplete(queue: AnalysisQueue, address: string, result: AnalysisResult): void {
  queue.inProgress.delete(address);
  queue.completed.set(address, result);
}

function markFailed(queue: AnalysisQueue, address: string, error: string): void {
  queue.inProgress.delete(address);
  queue.failed.set(address, error);
}

function getQueueStats(queue: AnalysisQueue): {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
} {
  return {
    pending: queue.pending.length,
    inProgress: queue.inProgress.size,
    completed: queue.completed.size,
    failed: queue.failed.size,
  };
}

function calculateSignalDecay(signalAge: number): number {
  const ageMinutes = signalAge / 60000;
  return Math.max(0, 1 - (SIGNAL_DECAY_RATE * ageMinutes));
}

function filterStaleSignals(signals: Signal[], maxAge: number): Signal[] {
  const now = Date.now();
  return signals.filter(s => (now - s.timestamp) < maxAge);
}

function normalizeSignalStrength(strength: number): number {
  return Math.max(0, Math.min(1, strength));
}

function weightedSignalAverage(signals: Signal[], weights: Map<string, number>): number {
  if (signals.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const signal of signals) {
    const weight = weights.get(signal.source) || 1;
    weightedSum += signal.strength * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export class AIBrainService {
  private config: AIEngineConfig;
  private signals: Signal[] = [];

  constructor(config?: Partial<AIEngineConfig>) {
    this.config = {
      modelVersion: "0.1.0",
      maxConcurrentTasks: 5,
      analysisDepth: config?.analysisDepth || "standard",
      dataSources: config?.dataSources || DEFAULT_DATA_SOURCES,
    };
  }

  async collectSignals(tokenAddress: string): Promise<Signal[]> {
    const signals: Signal[] = [];
    const enabledSources = this.config.dataSources.filter(s => s.enabled);

    for (const source of enabledSources) {
      const signal = await this.fetchSignalFromSource(source, tokenAddress);
      if (signal) {
        signals.push(signal);
      }
    }

    this.signals = signals;
    return signals;
  }

  private async fetchSignalFromSource(
    source: DataSource,
    tokenAddress: string
  ): Promise<Signal | null> {
    return {
      source: source.id,
      type: source.type,
      strength: 0.5 + Math.random() * 0.5,
      timestamp: Date.now(),
    };
  }

  async analyze(tokenAddress: string): Promise<AnalysisResult> {
    const signals = await this.collectSignals(tokenAddress);
    const aggregatedStrength = aggregateSignals(signals);
    const agreementRatio = this.calculateAgreementRatio(signals);
    const confidence = calculateConfidence(signals.length, agreementRatio, 0.85);

    return {
      confidence,
      signals,
      recommendation: this.getRecommendation(aggregatedStrength),
      reasoning: this.generateReasoning(signals),
    };
  }

  private calculateAgreementRatio(signals: Signal[]): number {
    if (signals.length < 2) return 1;
    const avgStrength = signals.reduce((s, sig) => s + sig.strength, 0) / signals.length;
    const variance = signals.reduce((v, sig) => v + Math.pow(sig.strength - avgStrength, 2), 0) / signals.length;
    return 1 - Math.min(1, variance);
  }

  private getRecommendation(strength: number): AnalysisResult["recommendation"] {
    if (strength >= 0.8) return "strong_buy";
    if (strength >= 0.6) return "buy";
    if (strength >= 0.4) return "hold";
    if (strength >= 0.2) return "sell";
    return "strong_sell";
  }

  private generateReasoning(signals: Signal[]): string[] {
    const reasons: string[] = [];
    signals.forEach(signal => {
      if (signal.strength > 0.7) {
        reasons.push(`Strong ${signal.type} signal from ${signal.source}`);
      }
    });
    return reasons;
  }
}
