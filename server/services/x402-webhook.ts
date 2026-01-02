import type { Request, Response } from "express";
import crypto from "crypto";

interface PaymentWebhook {
  eventId: string;
  eventType: "payment.completed" | "payment.failed" | "payment.pending";
  timestamp: string;
  payload: {
    transactionSignature: string;
    fromWallet: string;
    toWallet: string;
    amount: string;
    asset: string;
    agentId: string;
    resource: string;
  };
  signature: string;
}

interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  lastDelivery?: Date;
  failureCount: number;
}

const webhookSubscriptions: Map<string, WebhookSubscription> = new Map();
const webhookDeliveryLog: Array<{
  subscriptionId: string;
  eventId: string;
  status: "success" | "failed";
  timestamp: Date;
  responseCode?: number;
}> = [];

export function registerWebhook(url: string, events: string[]): WebhookSubscription {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  
  const subscription: WebhookSubscription = {
    id,
    url,
    events,
    secret,
    active: true,
    createdAt: new Date(),
    failureCount: 0
  };
  
  webhookSubscriptions.set(id, subscription);
  return subscription;
}

export function unregisterWebhook(subscriptionId: string): boolean {
  return webhookSubscriptions.delete(subscriptionId);
}

export function getWebhook(subscriptionId: string): WebhookSubscription | undefined {
  return webhookSubscriptions.get(subscriptionId);
}

export function getAllWebhooks(): WebhookSubscription[] {
  return Array.from(webhookSubscriptions.values());
}

export function updateWebhookStatus(subscriptionId: string, active: boolean): boolean {
  const subscription = webhookSubscriptions.get(subscriptionId);
  if (!subscription) return false;
  subscription.active = active;
  return true;
}

function generateSignature(payload: object, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

export function verifyWebhookSignature(payload: object, signature: string, secret: string): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function deliverWebhook(
  eventType: string,
  payload: PaymentWebhook["payload"]
): Promise<void> {
  const eventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  const subscriptions = Array.from(webhookSubscriptions.values())
    .filter(sub => sub.active && sub.events.includes(eventType));
  
  for (const subscription of subscriptions) {
    const webhookPayload: PaymentWebhook = {
      eventId,
      eventType: eventType as PaymentWebhook["eventType"],
      timestamp,
      payload,
      signature: generateSignature({ eventId, eventType, timestamp, payload }, subscription.secret)
    };
    
    try {
      const response = await fetch(subscription.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": webhookPayload.signature,
          "X-Event-Id": eventId,
          "X-Event-Type": eventType
        },
        body: JSON.stringify(webhookPayload)
      });
      
      webhookDeliveryLog.push({
        subscriptionId: subscription.id,
        eventId,
        status: response.ok ? "success" : "failed",
        timestamp: new Date(),
        responseCode: response.status
      });
      
      if (response.ok) {
        subscription.lastDelivery = new Date();
        subscription.failureCount = 0;
      } else {
        subscription.failureCount++;
        if (subscription.failureCount >= 5) {
          subscription.active = false;
        }
      }
    } catch (error) {
      webhookDeliveryLog.push({
        subscriptionId: subscription.id,
        eventId,
        status: "failed",
        timestamp: new Date()
      });
      subscription.failureCount++;
    }
  }
}

export function notifyPaymentCompleted(
  transactionSignature: string,
  fromWallet: string,
  amount: string,
  agentId: string,
  resource: string
): void {
  deliverWebhook("payment.completed", {
    transactionSignature,
    fromWallet,
    toWallet: "8ShrffvEuv9Uy4hLECKUGRFo6vN1qhY3Lkr4PDz2U92q",
    amount,
    asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    agentId,
    resource
  });
}

export function getDeliveryLogs(subscriptionId?: string, limit: number = 50): typeof webhookDeliveryLog {
  let logs = webhookDeliveryLog;
  if (subscriptionId) {
    logs = logs.filter(log => log.subscriptionId === subscriptionId);
  }
  return logs.slice(-limit);
}

export function getWebhookStats(): {
  total: number;
  active: number;
  deliveries: number;
  successRate: number;
} {
  const all = getAllWebhooks();
  const successfulDeliveries = webhookDeliveryLog.filter(l => l.status === "success").length;
  
  return {
    total: all.length,
    active: all.filter(w => w.active).length,
    deliveries: webhookDeliveryLog.length,
    successRate: webhookDeliveryLog.length > 0 
      ? (successfulDeliveries / webhookDeliveryLog.length) * 100 
      : 100
  };
}
