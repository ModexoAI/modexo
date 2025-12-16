export const MODEXO_VERSION = "0.2.0";

export const AGENT_IDS = {
  FAAP_X402: "faap-x402",
  X402_POLYMARKET: "x402-polymarket",
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
