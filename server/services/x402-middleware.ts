import type { Request, Response, NextFunction } from "express";

const X402_VERSION = 1;
const PAYMENT_RECEIVER = "8ShrffvEuv9Uy4hLECKUGRFo6vN1qhY3Lkr4PDz2U92q";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_NETWORK = "solana";

interface X402AgentConfig {
  id: string;
  name: string;
  description: string;
  priceUSD: number;
  resource: string;
  method: "GET" | "POST";
  inputSchema?: {
    queryParams?: Record<string, any>;
    bodyFields?: Record<string, any>;
  };
  outputSchema?: Record<string, any>;
}

function usdToMicroUSDC(usd: number): string {
  return Math.round(usd * 1_000_000).toString();
}

export function create402Response(agent: X402AgentConfig, baseUrl: string) {
  const fullResourceUrl = `${baseUrl}${agent.resource}`;
  
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_NETWORK,
        maxAmountRequired: usdToMicroUSDC(agent.priceUSD),
        resource: fullResourceUrl,
        description: agent.description,
        mimeType: "application/json",
        payTo: PAYMENT_RECEIVER,
        maxTimeoutSeconds: 60,
        asset: USDC_MINT,
        outputSchema: {
          input: {
            type: "http",
            method: agent.method,
            ...(agent.inputSchema?.queryParams && { queryParams: agent.inputSchema.queryParams }),
            ...(agent.inputSchema?.bodyFields && { bodyFields: agent.inputSchema.bodyFields })
          },
          output: agent.outputSchema
        },
        extra: {
          agentId: agent.id,
          agentName: agent.name,
          platform: "MODEXO",
          category: "AI Utility",
          name: "USD Coin",
          version: "2",
          feePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
        }
      }
    ]
  };
}

export function createX402Middleware(
  agent: X402AgentConfig,
  verifyPayment: (payload: any, agent: any, resourceUrl: string) => Promise<{ valid: boolean; error?: string }>,
  settlePayment: (payload: any, agent: any, resourceUrl: string) => Promise<{ success: boolean; receipt?: any; error?: string }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers["x-payment"] as string | undefined;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const baseUrl = `${protocol}://${req.get("host")}`;
    const resourceUrl = `${baseUrl}${agent.resource}`;

    if (!paymentHeader) {
      console.log("No X-Payment header, returning 402");
      return res.status(402).json(create402Response(agent, baseUrl));
    }

    console.log("X-Payment header received, length:", paymentHeader.length);

    let paymentPayload: any;
    try {
      paymentPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      console.log("Decoded payment payload keys:", Object.keys(paymentPayload));
    } catch (e) {
      console.log("Failed to decode payment header:", e);
      return res.status(402).json({
        x402Version: X402_VERSION,
        error: "Invalid payment header format",
        accepts: create402Response(agent, baseUrl).accepts
      });
    }

    const verification = await verifyPayment(paymentPayload, agent, resourceUrl);
    if (!verification.valid) {
      console.log("Payment verification failed:", verification.error);
      return res.status(402).json({
        x402Version: X402_VERSION,
        error: verification.error,
        accepts: create402Response(agent, baseUrl).accepts
      });
    }

    console.log("Payment verified, proceeding to handler");

    (req as any).settlePayment = async () => {
      return await settlePayment(paymentPayload, agent, resourceUrl);
    };

    next();
  };
}

export function decodePaymentHeader(header: string): any | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString());
  } catch {
    return null;
  }
}

export function encodePaymentResponse(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}
