export interface X402AgentConfig {
  id: string;
  name: string;
  description: string;
  category: 'AI Utility' | 'Marketing x402' | 'B2B x402' | 'Verification';
  status: 'online' | 'offline' | 'coming_soon';
  capabilities: string[];
  version: string;
  paymentRequired: boolean;
}

export interface X402AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  agentId: string;
}

export interface X402EntryZones {
  optimal: number;
  aggressive: number;
  conservative: number;
}

export interface X402SignalAnalysis {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  reasons: string[];
}

export interface X402MomentumData {
  score: number;
  trend: 'up' | 'down' | 'sideways';
  strength: 'strong' | 'moderate' | 'weak';
}

export interface X402VolumeMetrics {
  h1Volume: number;
  h24Volume: number;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  buyPressure: number;
}

export interface X402SupportLevels {
  level1: number;
  level2: number;
}

export type X402Recommendation = 'strong_buy' | 'buy' | 'wait' | 'avoid';

export const X402_AGENT_CATEGORIES = [
  'AI Utility',
  'Marketing x402', 
  'B2B x402',
  'Verification'
] as const;

export const X402_RECOMMENDATION_WEIGHTS = {
  signalStrength: 0.4,
  momentum: 0.3,
  liquidity: 0.3
} as const;
