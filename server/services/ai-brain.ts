import type { AIEngineConfig, AnalysisResult, Signal, DataSource } from "@shared/ai-engine";
import { aggregateSignals, calculateConfidence, DEFAULT_DATA_SOURCES } from "@shared/ai-engine";

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
