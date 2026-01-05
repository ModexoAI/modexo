interface RiskParameters {
  maxPositionSize: number;
  maxPortfolioRisk: number;
  maxDrawdown: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxOpenPositions: number;
  maxDailyLoss: number;
  cooldownMinutes: number;
}

interface RiskAssessment {
  approved: boolean;
  riskScore: number;
  warnings: string[];
  adjustedSize?: number;
  reason?: string;
}

interface PositionRisk {
  positionId: string;
  symbol: string;
  riskAmount: number;
  riskPercent: number;
  stopDistance: number;
  leverage: number;
}

interface DailyStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  maxDrawdown: number;
}

const defaultParams: RiskParameters = {
  maxPositionSize: 10000,
  maxPortfolioRisk: 0.02,
  maxDrawdown: 0.15,
  stopLossPercent: 0.05,
  takeProfitPercent: 0.10,
  maxOpenPositions: 10,
  maxDailyLoss: 500,
  cooldownMinutes: 30
};

let riskParams: RiskParameters = { ...defaultParams };
const dailyStats: Map<string, DailyStats> = new Map();
const positionRisks: Map<string, PositionRisk> = new Map();
let lastTradeTime: Date | null = null;
let tradingEnabled: boolean = true;

export function updateRiskParameters(params: Partial<RiskParameters>): void {
  riskParams = { ...riskParams, ...params };
}

export function getRiskParameters(): RiskParameters {
  return { ...riskParams };
}

export function assessTradeRisk(
  symbol: string,
  size: number,
  entryPrice: number,
  stopPrice: number,
  portfolioValue: number,
  openPositions: number
): RiskAssessment {
  const warnings: string[] = [];
  let riskScore = 0;
  
  if (!tradingEnabled) {
    return {
      approved: false,
      riskScore: 100,
      warnings: ["Trading disabled due to risk limits"],
      reason: "Risk limits exceeded"
    };
  }
  
  if (isInCooldown()) {
    return {
      approved: false,
      riskScore: 80,
      warnings: ["Cooldown period active"],
      reason: `Wait ${getCooldownRemaining()} minutes`
    };
  }
  
  if (size > riskParams.maxPositionSize) {
    warnings.push(`Position size exceeds maximum: ${riskParams.maxPositionSize}`);
    riskScore += 30;
  }
  
  if (openPositions >= riskParams.maxOpenPositions) {
    return {
      approved: false,
      riskScore: 90,
      warnings: ["Maximum open positions reached"],
      reason: `Limit: ${riskParams.maxOpenPositions} positions`
    };
  }
  
  const positionRisk = Math.abs(entryPrice - stopPrice) / entryPrice * size;
  const portfolioRiskPercent = positionRisk / portfolioValue;
  
  if (portfolioRiskPercent > riskParams.maxPortfolioRisk) {
    warnings.push(`Portfolio risk too high: ${(portfolioRiskPercent * 100).toFixed(2)}%`);
    riskScore += 40;
  }
  
  const todayStats = getTodayStats();
  if (todayStats.pnl < -riskParams.maxDailyLoss) {
    return {
      approved: false,
      riskScore: 100,
      warnings: ["Daily loss limit reached"],
      reason: `Max daily loss: $${riskParams.maxDailyLoss}`
    };
  }
  
  const stopDistance = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopDistance > riskParams.stopLossPercent * 2) {
    warnings.push("Stop loss distance unusually wide");
    riskScore += 15;
  }
  
  if (stopDistance < 0.005) {
    warnings.push("Stop loss too tight, may trigger prematurely");
    riskScore += 10;
  }
  
  let adjustedSize = size;
  if (riskScore > 50) {
    adjustedSize = size * (1 - (riskScore - 50) / 100);
    adjustedSize = Math.max(adjustedSize, size * 0.25);
  }
  
  return {
    approved: riskScore < 70,
    riskScore,
    warnings,
    adjustedSize: adjustedSize !== size ? adjustedSize : undefined,
    reason: riskScore >= 70 ? "Risk score too high" : undefined
  };
}

export function registerPositionRisk(
  positionId: string,
  symbol: string,
  size: number,
  entryPrice: number,
  stopPrice: number,
  leverage: number = 1
): void {
  const riskAmount = Math.abs(entryPrice - stopPrice) * size;
  const riskPercent = Math.abs(entryPrice - stopPrice) / entryPrice;
  const stopDistance = Math.abs(entryPrice - stopPrice);
  
  positionRisks.set(positionId, {
    positionId,
    symbol,
    riskAmount,
    riskPercent,
    stopDistance,
    leverage
  });
}

export function removePositionRisk(positionId: string): void {
  positionRisks.delete(positionId);
}

export function getTotalPortfolioRisk(): number {
  return Array.from(positionRisks.values())
    .reduce((sum, pr) => sum + pr.riskAmount, 0);
}

export function recordTradeResult(pnl: number, win: boolean): void {
  lastTradeTime = new Date();
  
  const today = new Date().toISOString().split('T')[0];
  const stats = dailyStats.get(today) || {
    date: today,
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    maxDrawdown: 0
  };
  
  stats.trades++;
  if (win) stats.wins++;
  else stats.losses++;
  stats.pnl += pnl;
  
  if (stats.pnl < stats.maxDrawdown) {
    stats.maxDrawdown = stats.pnl;
  }
  
  dailyStats.set(today, stats);
  
  checkRiskLimits(stats);
}

function checkRiskLimits(stats: DailyStats): void {
  if (stats.pnl < -riskParams.maxDailyLoss) {
    tradingEnabled = false;
  }
  
  if (Math.abs(stats.maxDrawdown) > riskParams.maxDrawdown * 10000) {
    tradingEnabled = false;
  }
}

function isInCooldown(): boolean {
  if (!lastTradeTime) return false;
  
  const elapsed = (Date.now() - lastTradeTime.getTime()) / 60000;
  return elapsed < riskParams.cooldownMinutes;
}

function getCooldownRemaining(): number {
  if (!lastTradeTime) return 0;
  
  const elapsed = (Date.now() - lastTradeTime.getTime()) / 60000;
  return Math.max(0, Math.ceil(riskParams.cooldownMinutes - elapsed));
}

function getTodayStats(): DailyStats {
  const today = new Date().toISOString().split('T')[0];
  return dailyStats.get(today) || {
    date: today,
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    maxDrawdown: 0
  };
}

export function getDailyStats(days: number = 7): DailyStats[] {
  const result: DailyStats[] = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    result.push(dailyStats.get(dateStr) || {
      date: dateStr,
      trades: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      maxDrawdown: 0
    });
  }
  
  return result;
}

export function resetDailyLimits(): void {
  tradingEnabled = true;
  lastTradeTime = null;
}

export function isTradingEnabled(): boolean {
  return tradingEnabled;
}

export function enableTrading(): void {
  tradingEnabled = true;
}

export function disableTrading(): void {
  tradingEnabled = false;
}
