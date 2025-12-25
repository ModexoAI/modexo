import type { Signal, AnalysisResult } from "@shared/ai-engine";

const METRICS_WINDOW_MS = 3600000;
const MAX_METRIC_ENTRIES = 1000;

interface AgentMetric {
  agentId: string;
  timestamp: number;
  analysisTime: number;
  signalCount: number;
  confidence: number;
}

const metricsBuffer: AgentMetric[] = [];

export function recordAgentAnalysis(
  agentId: string,
  result: AnalysisResult,
  durationMs: number
): void {
  const metric: AgentMetric = {
    agentId,
    timestamp: Date.now(),
    analysisTime: durationMs,
    signalCount: result.signals.length,
    confidence: result.confidence,
  };

  metricsBuffer.push(metric);
  
  if (metricsBuffer.length > MAX_METRIC_ENTRIES) {
    metricsBuffer.shift();
  }
}

export function getAgentPerformance(agentId: string): {
  avgAnalysisTime: number;
  avgConfidence: number;
  totalAnalyses: number;
} {
  const now = Date.now();
  const recentMetrics = metricsBuffer.filter(
    (m) => m.agentId === agentId && now - m.timestamp < METRICS_WINDOW_MS
  );

  if (recentMetrics.length === 0) {
    return { avgAnalysisTime: 0, avgConfidence: 0, totalAnalyses: 0 };
  }

  const totalTime = recentMetrics.reduce((sum, m) => sum + m.analysisTime, 0);
  const totalConf = recentMetrics.reduce((sum, m) => sum + m.confidence, 0);

  return {
    avgAnalysisTime: totalTime / recentMetrics.length,
    avgConfidence: totalConf / recentMetrics.length,
    totalAnalyses: recentMetrics.length,
  };
}
