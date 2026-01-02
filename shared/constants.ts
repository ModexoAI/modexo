export const MODEXO_VERSION = "0.4.0";
export const BUILD_DATE = "2024-12";

export const RESOURCE_LIMITS = {
  MAX_MEMORY_MB: 512,
  MAX_CPU_PERCENT: 80,
  MAX_CONNECTIONS: 100,
  MAX_QUEUE_SIZE: 1000,
} as const;

export const PRIORITY_WEIGHTS = {
  CRITICAL: 1.0,
  HIGH: 0.75,
  NORMAL: 0.5,
  LOW: 0.25,
  BACKGROUND: 0.1,
} as const;

interface ResourceUsage {
  memoryMB: number;
  cpuPercent: number;
  activeConnections: number;
  queueSize: number;
}

export function checkResourceAvailability(usage: ResourceUsage): boolean {
  return (
    usage.memoryMB < RESOURCE_LIMITS.MAX_MEMORY_MB &&
    usage.cpuPercent < RESOURCE_LIMITS.MAX_CPU_PERCENT &&
    usage.activeConnections < RESOURCE_LIMITS.MAX_CONNECTIONS &&
    usage.queueSize < RESOURCE_LIMITS.MAX_QUEUE_SIZE
  );
}

export function calculateExecutionPriority(
  urgency: keyof typeof PRIORITY_WEIGHTS,
  resourceUsage: ResourceUsage
): number {
  const baseWeight = PRIORITY_WEIGHTS[urgency];
  const resourcePenalty = Math.min(1, resourceUsage.cpuPercent / RESOURCE_LIMITS.MAX_CPU_PERCENT);
  return baseWeight * (1 - resourcePenalty * 0.3);
}

export function getThrottleDelay(queueSize: number): number {
  if (queueSize < 100) return 0;
  if (queueSize < 500) return 100;
  if (queueSize < 800) return 500;
  return 1000;
}

export const RISK_LEVELS = {
  LOW: { threshold: 0.3, label: "Low Risk", color: "#22c55e" },
  MEDIUM: { threshold: 0.6, label: "Medium Risk", color: "#eab308" },
  HIGH: { threshold: 0.85, label: "High Risk", color: "#f97316" },
  CRITICAL: { threshold: 1.0, label: "Critical Risk", color: "#ef4444" },
} as const;

export const ANALYSIS_TIMEFRAMES = {
  REALTIME: { ms: 0, label: "Real-time" },
  MINUTES_5: { ms: 300000, label: "5 Minutes" },
  MINUTES_15: { ms: 900000, label: "15 Minutes" },
  HOUR_1: { ms: 3600000, label: "1 Hour" },
  HOURS_4: { ms: 14400000, label: "4 Hours" },
  DAY_1: { ms: 86400000, label: "24 Hours" },
} as const;

export const TOKEN_FILTERS = {
  MIN_LIQUIDITY_USD: 5000,
  MIN_VOLUME_24H: 1000,
  MIN_HOLDERS: 50,
  MAX_TOP_HOLDER_PERCENT: 0.5,
  MIN_SAFETY_SCORE: 40,
} as const;

export const AGENT_LIMITS = {
  MAX_CONCURRENT_ANALYSES: 10,
  MAX_TOKENS_PER_SCAN: 500,
  MAX_WALLET_TRACKING: 100,
  ANALYSIS_TIMEOUT_MS: 30000,
} as const;

export function getRiskLevel(score: number): typeof RISK_LEVELS[keyof typeof RISK_LEVELS] {
  if (score <= RISK_LEVELS.LOW.threshold) return RISK_LEVELS.LOW;
  if (score <= RISK_LEVELS.MEDIUM.threshold) return RISK_LEVELS.MEDIUM;
  if (score <= RISK_LEVELS.HIGH.threshold) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.CRITICAL;
}

export function getTimeframeMs(key: keyof typeof ANALYSIS_TIMEFRAMES): number {
  return ANALYSIS_TIMEFRAMES[key].ms;
}

export const AGENT_IDS = {
  FAAP_X402: "faap-x402",
  X402_MODEXOBET: "x402-ModexoBet",
  X402_SNIPER: "x402-sniper",
  X402_PORTFOLIO: "x402-portfolio",
} as const;

export const PAYMENT_TYPES = {
  PROOF_OF_WORK: "proof_of_work",
  PROOF_OF_PAYMENT: "proof_of_payment",
} as const;

export const TASK_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const SOLANA_NETWORKS = {
  MAINNET: "mainnet-beta",
  DEVNET: "devnet",
} as const;

export const DEFAULT_AGENT_SETTINGS = {
  analysisDepth: "standard" as const,
  maxConcurrentTasks: 5,
  refreshInterval: 30000,
  minConfidenceThreshold: 0.65,
};

export const X402_ENDPOINTS = {
  PAYMENT_INIT: "/api/x402/payment/init",
  PAYMENT_VERIFY: "/api/x402/payment/verify",
  AGENT_EXECUTE: "/api/x402/agent/execute",
  AGENT_STATUS: "/api/x402/agent/status",
};
