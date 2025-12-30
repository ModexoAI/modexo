import type { Request, Response, NextFunction } from "express";

const X402_VERSION = 1;
const PAYMENT_RECEIVER = "8ShrffvEuv9Uy4hLECKUGRFo6vN1qhY3Lkr4PDz2U92q";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_NETWORK = "solana";
const FACILITATOR_URL = "https://facilitator.payai.network";

export interface X402AgentConfig {
  id: string;
  name: string;
  description: string;
  priceUSD: number;
  resource: string;
  method: "GET" | "POST";
  inputSchema?: {
    queryParams?: Record<string, FieldDef>;
    bodyFields?: Record<string, FieldDef>;
  };
  outputSchema?: Record<string, any>;
}

interface FieldDef {
  type?: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

interface X402Response {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    outputSchema?: object;
    extra?: object;
  }>;
}

export const MODEXO_AGENTS: X402AgentConfig[] = [
  {
    id: "x402-portfolio",
    name: "x402 Portfolio Agent",
    description: "AI-powered portfolio analysis for any Solana wallet. Returns holdings, token distribution, and performance insights.",
    priceUSD: 0.10,
    resource: "/api/x402/portfolio",
    method: "GET",
    inputSchema: {
      queryParams: {
        wallet: {
          type: "string",
          required: true,
          description: "Solana wallet address to analyze"
        }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        totalValueUSD: { type: "number" },
        tokens: { type: "array" },
        analysis: { type: "string" }
      }
    }
  },
  {
    id: "x402-entry",
    name: "x402 Smart Entry Agent", 
    description: "AI-calculated optimal entry points for any Solana token. Returns support levels, resistance zones, and entry recommendations.",
    priceUSD: 0.10,
    resource: "/api/x402/entry",
    method: "GET",
    inputSchema: {
      queryParams: {
        token: {
          type: "string",
          required: true,
          description: "Token address or symbol to analyze"
        }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        currentPrice: { type: "number" },
        entryZones: { type: "array" },
        recommendation: { type: "string" }
      }
    }
  },
  {
    id: "x402-liquidity",
    name: "x402 Liquidity Scanner Agent",
    description: "Deep liquidity analysis for Solana tokens. Returns depth analysis, concentration risk, slippage estimates, and safety scoring.",
    priceUSD: 0.10,
    resource: "/api/x402/liquidity",
    method: "GET",
    inputSchema: {
      queryParams: {
        token: {
          type: "string",
          required: true,
          description: "Token address or symbol to scan"
        }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        liquidityUSD: { type: "number" },
        healthScore: { type: "number" },
        analysis: { type: "object" }
      }
    }
  }
];

function usdToMicroUSDC(usd: number): string {
  return Math.round(usd * 1_000_000).toString();
}

export function getAgentById(agentId: string): X402AgentConfig | undefined {
  return MODEXO_AGENTS.find(a => a.id === agentId);
}

export function getAgentByResource(resource: string): X402AgentConfig | undefined {
  return MODEXO_AGENTS.find(a => a.resource === resource);
}

export function getAllAgentsInfo(): object[] {
  return MODEXO_AGENTS.map(agent => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    priceUSD: agent.priceUSD,
    resource: agent.resource,
    method: agent.method
  }));
}
