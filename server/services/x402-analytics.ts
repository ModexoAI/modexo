import { db } from "../db";

interface AgentCallMetric {
  agentId: string;
  walletAddress: string;
  timestamp: Date;
  responseTimeMs: number;
  success: boolean;
  paymentAmount: number;
  errorMessage?: string;
}

interface AgentStats {
  agentId: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalRevenue: number;
  averageResponseTime: number;
  uniqueUsers: number;
}

interface DailyMetrics {
  date: string;
  callCount: number;
  revenue: number;
  uniqueWallets: number;
}

const metricsStore: Map<string, AgentCallMetric[]> = new Map();
const dailyCache: Map<string, DailyMetrics> = new Map();

export function recordAgentCall(metric: AgentCallMetric): void {
  const key = metric.agentId;
  if (!metricsStore.has(key)) {
    metricsStore.set(key, []);
  }
  metricsStore.get(key)!.push(metric);
  
  const dateKey = `${metric.agentId}-${metric.timestamp.toISOString().split('T')[0]}`;
  const existing = dailyCache.get(dateKey) || {
    date: metric.timestamp.toISOString().split('T')[0],
    callCount: 0,
    revenue: 0,
    uniqueWallets: 0
  };
  existing.callCount++;
  existing.revenue += metric.paymentAmount;
  dailyCache.set(dateKey, existing);
}

export function getAgentStats(agentId: string): AgentStats {
  const metrics = metricsStore.get(agentId) || [];
  const uniqueWallets = new Set(metrics.map(m => m.walletAddress));
  const successfulCalls = metrics.filter(m => m.success);
  const totalResponseTime = successfulCalls.reduce((sum, m) => sum + m.responseTimeMs, 0);
  
  return {
    agentId,
    totalCalls: metrics.length,
    successfulCalls: successfulCalls.length,
    failedCalls: metrics.length - successfulCalls.length,
    totalRevenue: metrics.reduce((sum, m) => sum + m.paymentAmount, 0),
    averageResponseTime: successfulCalls.length > 0 ? totalResponseTime / successfulCalls.length : 0,
    uniqueUsers: uniqueWallets.size
  };
}

export function getAllAgentStats(): AgentStats[] {
  const agentIds = Array.from(metricsStore.keys());
  return agentIds.map(id => getAgentStats(id));
}

export function getDailyMetrics(agentId: string, days: number = 30): DailyMetrics[] {
  const results: DailyMetrics[] = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const key = `${agentId}-${dateStr}`;
    
    results.push(dailyCache.get(key) || {
      date: dateStr,
      callCount: 0,
      revenue: 0,
      uniqueWallets: 0
    });
  }
  
  return results.reverse();
}

export function getTopUsers(agentId: string, limit: number = 10): Array<{wallet: string; calls: number; spent: number}> {
  const metrics = metricsStore.get(agentId) || [];
  const userStats = new Map<string, {calls: number; spent: number}>();
  
  for (const metric of metrics) {
    const existing = userStats.get(metric.walletAddress) || {calls: 0, spent: 0};
    existing.calls++;
    existing.spent += metric.paymentAmount;
    userStats.set(metric.walletAddress, existing);
  }
  
  return Array.from(userStats.entries())
    .map(([wallet, stats]) => ({wallet, ...stats}))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

export function getRevenueByPeriod(startDate: Date, endDate: Date): {total: number; byAgent: Record<string, number>} {
  const byAgent: Record<string, number> = {};
  let total = 0;
  
  for (const [agentId, metrics] of metricsStore.entries()) {
    const filtered = metrics.filter(m => 
      m.timestamp >= startDate && m.timestamp <= endDate
    );
    const revenue = filtered.reduce((sum, m) => sum + m.paymentAmount, 0);
    byAgent[agentId] = revenue;
    total += revenue;
  }
  
  return {total, byAgent};
}

export function getSuccessRate(agentId: string): number {
  const metrics = metricsStore.get(agentId) || [];
  if (metrics.length === 0) return 100;
  const successful = metrics.filter(m => m.success).length;
  return (successful / metrics.length) * 100;
}

export function getAverageResponseTime(agentId: string): number {
  const metrics = metricsStore.get(agentId) || [];
  const successful = metrics.filter(m => m.success);
  if (successful.length === 0) return 0;
  const total = successful.reduce((sum, m) => sum + m.responseTimeMs, 0);
  return total / successful.length;
}

export function clearMetrics(agentId?: string): void {
  if (agentId) {
    metricsStore.delete(agentId);
    for (const key of dailyCache.keys()) {
      if (key.startsWith(agentId)) {
        dailyCache.delete(key);
      }
    }
  } else {
    metricsStore.clear();
    dailyCache.clear();
  }
}

export function exportMetrics(agentId: string): string {
  const stats = getAgentStats(agentId);
  const daily = getDailyMetrics(agentId, 30);
  const topUsers = getTopUsers(agentId, 10);
  
  return JSON.stringify({
    stats,
    dailyMetrics: daily,
    topUsers,
    exportedAt: new Date().toISOString()
  }, null, 2);
}
