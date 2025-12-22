import { X402_PROTOCOL_VERSION, X402_MIN_CONFIRMATION_BLOCKS, validateX402Signature, validateSolanaAddress } from "@shared/x402";

const VERIFICATION_TIMEOUT_MS = 60000;
const BLOCK_TIME_MS = 400;
const MAX_VERIFICATION_RETRIES = 5;

interface TransactionVerification {
  signature: string;
  expectedAmount: number;
  expectedRecipient: string;
  expectedSender: string;
  submittedAt: number;
  verifiedAt?: number;
  status: "pending" | "confirming" | "verified" | "failed" | "timeout";
  confirmations: number;
  blockHeight?: number;
  slot?: number;
  errorCode?: string;
  retryCount: number;
}

interface BlockConfirmation {
  blockHeight: number;
  blockHash: string;
  slot: number;
  timestamp: number;
  transactions: string[];
}

interface VerificationMetrics {
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  timeoutVerifications: number;
  averageConfirmationTime: number;
  averageConfirmations: number;
}

const pendingVerifications = new Map<string, TransactionVerification>();
const confirmedTransactions = new Map<string, TransactionVerification>();
const verificationMetrics: VerificationMetrics = {
  totalVerifications: 0,
  successfulVerifications: 0,
  failedVerifications: 0,
  timeoutVerifications: 0,
  averageConfirmationTime: 0,
  averageConfirmations: 0,
};

export function submitForVerification(
  signature: string,
  expectedAmount: number,
  expectedRecipient: string,
  expectedSender: string
): TransactionVerification | null {
  if (!validateX402Signature(signature)) {
    return null;
  }

  if (!validateSolanaAddress(expectedRecipient) || !validateSolanaAddress(expectedSender)) {
    return null;
  }

  if (expectedAmount <= 0) {
    return null;
  }

  const verification: TransactionVerification = {
    signature,
    expectedAmount,
    expectedRecipient,
    expectedSender,
    submittedAt: Date.now(),
    status: "pending",
    confirmations: 0,
    retryCount: 0,
  };

  pendingVerifications.set(signature, verification);
  verificationMetrics.totalVerifications++;

  return verification;
}

export function updateConfirmations(
  signature: string,
  confirmations: number,
  blockHeight: number,
  slot: number
): boolean {
  const verification = pendingVerifications.get(signature);
  
  if (!verification) return false;

  verification.confirmations = confirmations;
  verification.blockHeight = blockHeight;
  verification.slot = slot;
  verification.status = "confirming";

  if (confirmations >= X402_MIN_CONFIRMATION_BLOCKS) {
    verification.status = "verified";
    verification.verifiedAt = Date.now();
    
    pendingVerifications.delete(signature);
    confirmedTransactions.set(signature, verification);
    
    recordSuccessfulVerification(verification);
  }

  return true;
}

function recordSuccessfulVerification(verification: TransactionVerification): void {
  verificationMetrics.successfulVerifications++;
  
  if (verification.verifiedAt && verification.submittedAt) {
    const confirmationTime = verification.verifiedAt - verification.submittedAt;
    const totalTime = verificationMetrics.averageConfirmationTime * 
      (verificationMetrics.successfulVerifications - 1);
    verificationMetrics.averageConfirmationTime = 
      (totalTime + confirmationTime) / verificationMetrics.successfulVerifications;
  }
  
  const totalConfirmations = verificationMetrics.averageConfirmations * 
    (verificationMetrics.successfulVerifications - 1);
  verificationMetrics.averageConfirmations = 
    (totalConfirmations + verification.confirmations) / verificationMetrics.successfulVerifications;
}

export function markVerificationFailed(
  signature: string,
  errorCode: string
): boolean {
  const verification = pendingVerifications.get(signature);
  
  if (!verification) return false;

  verification.retryCount++;

  if (verification.retryCount >= MAX_VERIFICATION_RETRIES) {
    verification.status = "failed";
    verification.errorCode = errorCode;
    pendingVerifications.delete(signature);
    verificationMetrics.failedVerifications++;
    return true;
  }

  return false;
}

export function checkTimeouts(): string[] {
  const now = Date.now();
  const timedOut: string[] = [];
  const entries = Array.from(pendingVerifications.entries());

  for (const [signature, verification] of entries) {
    if (now - verification.submittedAt > VERIFICATION_TIMEOUT_MS) {
      verification.status = "timeout";
      pendingVerifications.delete(signature);
      verificationMetrics.timeoutVerifications++;
      timedOut.push(signature);
    }
  }

  return timedOut;
}

export function getVerificationStatus(signature: string): TransactionVerification | null {
  return pendingVerifications.get(signature) || 
         confirmedTransactions.get(signature) || 
         null;
}

export function isTransactionVerified(signature: string): boolean {
  const verification = confirmedTransactions.get(signature);
  return verification?.status === "verified";
}

export function getConfirmationProgress(signature: string): number {
  const verification = pendingVerifications.get(signature) || 
                       confirmedTransactions.get(signature);
  
  if (!verification) return 0;
  
  return Math.min(100, (verification.confirmations / X402_MIN_CONFIRMATION_BLOCKS) * 100);
}

export function estimateConfirmationTime(currentConfirmations: number): number {
  const remainingBlocks = Math.max(0, X402_MIN_CONFIRMATION_BLOCKS - currentConfirmations);
  return remainingBlocks * BLOCK_TIME_MS;
}

export function getVerificationMetrics(): VerificationMetrics {
  return { ...verificationMetrics };
}

export function getPendingVerifications(): TransactionVerification[] {
  return Array.from(pendingVerifications.values());
}

export function getConfirmedTransactions(limit: number = 100): TransactionVerification[] {
  return Array.from(confirmedTransactions.values()).slice(-limit);
}

export function verifyTransactionDetails(
  signature: string,
  actualAmount: number,
  actualRecipient: string,
  actualSender: string
): { valid: boolean; errors: string[] } {
  const verification = pendingVerifications.get(signature) || 
                       confirmedTransactions.get(signature);
  
  const errors: string[] = [];
  
  if (!verification) {
    errors.push("Transaction not found in verification system");
    return { valid: false, errors };
  }

  if (Math.abs(actualAmount - verification.expectedAmount) > 0.000001) {
    errors.push(`Amount mismatch: expected ${verification.expectedAmount}, got ${actualAmount}`);
  }

  if (actualRecipient !== verification.expectedRecipient) {
    errors.push(`Recipient mismatch: expected ${verification.expectedRecipient}`);
  }

  if (actualSender !== verification.expectedSender) {
    errors.push(`Sender mismatch: expected ${verification.expectedSender}`);
  }

  return { valid: errors.length === 0, errors };
}

export function clearOldVerifications(maxAgeMs: number = 86400000): number {
  const now = Date.now();
  let cleared = 0;
  const entries = Array.from(confirmedTransactions.entries());

  for (const [signature, verification] of entries) {
    if (verification.verifiedAt && now - verification.verifiedAt > maxAgeMs) {
      confirmedTransactions.delete(signature);
      cleared++;
    }
  }

  return cleared;
}

export const X402_VERIFICATION_CONFIG = {
  version: X402_PROTOCOL_VERSION,
  requiredConfirmations: X402_MIN_CONFIRMATION_BLOCKS,
  verificationTimeout: VERIFICATION_TIMEOUT_MS,
  estimatedBlockTime: BLOCK_TIME_MS,
  maxRetries: MAX_VERIFICATION_RETRIES,
};
