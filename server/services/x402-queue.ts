import { X402_PROTOCOL_VERSION } from "@shared/x402";
import { randomBytes } from "crypto";

const MAX_QUEUE_SIZE = 1000;
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

type PaymentPriority = "low" | "normal" | "high" | "critical";

interface QueuedPayment {
  id: string;
  walletAddress: string;
  agentId: string;
  amount: number;
  priority: PaymentPriority;
  createdAt: number;
  processedAt?: number;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  errorMessage?: string;
  batchId?: string;
}

interface PaymentBatch {
  id: string;
  payments: string[];
  totalAmount: number;
  createdAt: number;
  processedAt?: number;
  status: "pending" | "processing" | "completed" | "partial" | "failed";
  successCount: number;
  failureCount: number;
}

interface QueueMetrics {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  currentQueueSize: number;
  batchesProcessed: number;
}

const paymentQueue: QueuedPayment[] = [];
const paymentMap = new Map<string, QueuedPayment>();
const batchHistory = new Map<string, PaymentBatch>();
const queueMetrics: QueueMetrics = {
  totalQueued: 0,
  totalProcessed: 0,
  totalFailed: 0,
  averageProcessingTime: 0,
  currentQueueSize: 0,
  batchesProcessed: 0,
};

const priorityWeights: Record<PaymentPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function generatePaymentId(): string {
  const secureToken = randomBytes(8).toString('hex');
  return `x402_pmt_${Date.now()}_${secureToken}`;
}

function generateBatchId(): string {
  const secureToken = randomBytes(6).toString('hex');
  return `x402_batch_${Date.now()}_${secureToken}`;
}

export function enqueuePayment(
  walletAddress: string,
  agentId: string,
  amount: number,
  priority: PaymentPriority = "normal"
): QueuedPayment | null {
  if (paymentQueue.length >= MAX_QUEUE_SIZE) {
    return null;
  }

  const payment: QueuedPayment = {
    id: generatePaymentId(),
    walletAddress,
    agentId,
    amount,
    priority,
    createdAt: Date.now(),
    status: "pending",
    retryCount: 0,
  };

  const insertIndex = findInsertIndex(payment);
  paymentQueue.splice(insertIndex, 0, payment);
  paymentMap.set(payment.id, payment);
  
  queueMetrics.totalQueued++;
  queueMetrics.currentQueueSize = paymentQueue.length;

  return payment;
}

function findInsertIndex(payment: QueuedPayment): number {
  const weight = priorityWeights[payment.priority];
  
  for (let i = 0; i < paymentQueue.length; i++) {
    const existingWeight = priorityWeights[paymentQueue[i].priority];
    if (weight > existingWeight) {
      return i;
    }
  }
  
  return paymentQueue.length;
}

export function getPaymentStatus(paymentId: string): QueuedPayment | null {
  return paymentMap.get(paymentId) || null;
}

export function dequeuePayments(count: number = BATCH_SIZE): QueuedPayment[] {
  const payments: QueuedPayment[] = [];
  
  while (payments.length < count && paymentQueue.length > 0) {
    const payment = paymentQueue.shift();
    if (payment && payment.status === "pending") {
      payment.status = "processing";
      payments.push(payment);
    }
  }
  
  queueMetrics.currentQueueSize = paymentQueue.length;
  return payments;
}

export function createBatch(): PaymentBatch | null {
  const payments = dequeuePayments(BATCH_SIZE);
  
  if (payments.length === 0) return null;

  const batch: PaymentBatch = {
    id: generateBatchId(),
    payments: payments.map(p => p.id),
    totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    createdAt: Date.now(),
    status: "pending",
    successCount: 0,
    failureCount: 0,
  };

  for (const payment of payments) {
    payment.batchId = batch.id;
  }

  batchHistory.set(batch.id, batch);
  return batch;
}

export function markPaymentCompleted(paymentId: string): boolean {
  const payment = paymentMap.get(paymentId);
  
  if (!payment) return false;

  payment.status = "completed";
  payment.processedAt = Date.now();
  
  const processingTime = payment.processedAt - payment.createdAt;
  const totalTime = queueMetrics.averageProcessingTime * queueMetrics.totalProcessed;
  queueMetrics.totalProcessed++;
  queueMetrics.averageProcessingTime = (totalTime + processingTime) / queueMetrics.totalProcessed;

  if (payment.batchId) {
    const batch = batchHistory.get(payment.batchId);
    if (batch) {
      batch.successCount++;
      updateBatchStatus(batch);
    }
  }

  return true;
}

export function markPaymentFailed(paymentId: string, errorMessage: string): boolean {
  const payment = paymentMap.get(paymentId);
  
  if (!payment) return false;

  payment.retryCount++;
  payment.errorMessage = errorMessage;

  if (payment.retryCount < MAX_RETRIES) {
    payment.status = "pending";
    const insertIndex = findInsertIndex(payment);
    paymentQueue.splice(insertIndex, 0, payment);
    queueMetrics.currentQueueSize = paymentQueue.length;
  } else {
    payment.status = "failed";
    queueMetrics.totalFailed++;
    
    if (payment.batchId) {
      const batch = batchHistory.get(payment.batchId);
      if (batch) {
        batch.failureCount++;
        updateBatchStatus(batch);
      }
    }
  }

  return true;
}

function updateBatchStatus(batch: PaymentBatch): void {
  const totalProcessed = batch.successCount + batch.failureCount;
  const totalPayments = batch.payments.length;

  if (totalProcessed === totalPayments) {
    batch.processedAt = Date.now();
    
    if (batch.failureCount === 0) {
      batch.status = "completed";
    } else if (batch.successCount === 0) {
      batch.status = "failed";
    } else {
      batch.status = "partial";
    }
    
    queueMetrics.batchesProcessed++;
  } else {
    batch.status = "processing";
  }
}

export function getBatch(batchId: string): PaymentBatch | null {
  return batchHistory.get(batchId) || null;
}

export function getQueueMetrics(): QueueMetrics {
  return { ...queueMetrics };
}

export function getQueueLength(): number {
  return paymentQueue.length;
}

export function getPendingPayments(): QueuedPayment[] {
  return paymentQueue.filter(p => p.status === "pending");
}

export function clearCompletedPayments(): number {
  let cleared = 0;
  const idsToRemove: string[] = [];
  const entries = Array.from(paymentMap.entries());

  for (const [id, payment] of entries) {
    if (payment.status === "completed" || payment.status === "failed") {
      idsToRemove.push(id);
      cleared++;
    }
  }

  for (const id of idsToRemove) {
    paymentMap.delete(id);
  }

  return cleared;
}

export function estimateProcessingTime(priority: PaymentPriority): number {
  const queuePosition = paymentQueue.filter(
    p => priorityWeights[p.priority] >= priorityWeights[priority]
  ).length;
  
  const estimatedBatches = Math.ceil(queuePosition / BATCH_SIZE);
  return estimatedBatches * BATCH_INTERVAL_MS;
}

export const X402_QUEUE_CONFIG = {
  version: X402_PROTOCOL_VERSION,
  maxQueueSize: MAX_QUEUE_SIZE,
  batchSize: BATCH_SIZE,
  batchInterval: BATCH_INTERVAL_MS,
  maxRetries: MAX_RETRIES,
  retryDelay: RETRY_DELAY_MS,
};
