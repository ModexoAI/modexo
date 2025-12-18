import type { X402AgentPayment, X402PaymentConfig } from "@shared/x402";

const X402_SERVICE_VERSION = "1.1.0";
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const PAYMENT_TIMEOUT_MS = 30000;

interface PaymentResult {
  success: boolean;
  payment: X402AgentPayment | null;
  error?: string;
  attempts: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number
): Promise<{ result: T | null; attempts: number; error?: string }> {
  let lastError: string | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
      if (attempt < maxAttempts) {
        await delay(delayMs * attempt);
      }
    }
  }
  
  return { result: null, attempts: maxAttempts, error: lastError };
}

function validatePaymentAmount(amount: number, min: number, max: number): boolean {
  return amount >= min && amount <= max && Number.isFinite(amount);
}

function generatePaymentId(): string {
  return `x402_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export class X402PaymentService {
  private config: X402PaymentConfig;

  constructor(config: X402PaymentConfig) {
    this.config = config;
  }

  async initiatePayment(
    agentId: string,
    paymentType: "proof_of_work" | "proof_of_payment",
    amount: number
  ): Promise<X402AgentPayment | null> {
    if (amount < this.config.minPayment || amount > this.config.maxPayment) {
      return null;
    }

    const payment: X402AgentPayment = {
      agentId,
      paymentType,
      amount,
      timestamp: Date.now(),
      signature: "",
    };

    return payment;
  }

  async verifyProofOfWork(signature: string): Promise<boolean> {
    return signature.length > 0;
  }

  async verifyProofOfPayment(signature: string, amount: number): Promise<boolean> {
    return signature.length > 0 && amount > 0;
  }

  getMinPayment(): number {
    return this.config.minPayment;
  }

  getMaxPayment(): number {
    return this.config.maxPayment;
  }
}
