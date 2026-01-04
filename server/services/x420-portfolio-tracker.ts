interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnL: number;
  realizedPnL: number;
  openedAt: Date;
  walletAddress: string;
}

interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface TradeHistory {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  pnl: number;
  timestamp: Date;
}

interface PortfolioSnapshot {
  timestamp: Date;
  totalValue: number;
  positions: number;
  pnl: number;
}

const positions: Map<string, Position> = new Map();
const tradeHistory: TradeHistory[] = [];
const portfolioSnapshots: PortfolioSnapshot[] = [];
const walletPortfolios: Map<string, Set<string>> = new Map();

export function openPosition(
  symbol: string,
  side: "long" | "short",
  entryPrice: number,
  quantity: number,
  walletAddress: string
): Position {
  const id = `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const position: Position = {
    id,
    symbol,
    side,
    entryPrice,
    currentPrice: entryPrice,
    quantity,
    unrealizedPnL: 0,
    realizedPnL: 0,
    openedAt: new Date(),
    walletAddress
  };
  
  positions.set(id, position);
  
  if (!walletPortfolios.has(walletAddress)) {
    walletPortfolios.set(walletAddress, new Set());
  }
  walletPortfolios.get(walletAddress)!.add(id);
  
  recordTrade(symbol, side === "long" ? "buy" : "sell", entryPrice, quantity, 0);
  
  return position;
}

export function closePosition(positionId: string, exitPrice: number): Position | null {
  const position = positions.get(positionId);
  if (!position) return null;
  
  const pnl = calculatePnL(position, exitPrice);
  position.realizedPnL = pnl;
  position.currentPrice = exitPrice;
  
  recordTrade(
    position.symbol,
    position.side === "long" ? "sell" : "buy",
    exitPrice,
    position.quantity,
    pnl
  );
  
  positions.delete(positionId);
  
  const walletPositions = walletPortfolios.get(position.walletAddress);
  if (walletPositions) {
    walletPositions.delete(positionId);
  }
  
  return position;
}

function calculatePnL(position: Position, currentPrice: number): number {
  const priceDiff = currentPrice - position.entryPrice;
  const multiplier = position.side === "long" ? 1 : -1;
  return priceDiff * position.quantity * multiplier;
}

export function updatePositionPrice(positionId: string, currentPrice: number): void {
  const position = positions.get(positionId);
  if (!position) return;
  
  position.currentPrice = currentPrice;
  position.unrealizedPnL = calculatePnL(position, currentPrice);
}

export function updateAllPrices(priceMap: Map<string, number>): void {
  for (const position of positions.values()) {
    const price = priceMap.get(position.symbol);
    if (price) {
      updatePositionPrice(position.id, price);
    }
  }
}

function recordTrade(symbol: string, side: "buy" | "sell", price: number, quantity: number, pnl: number): void {
  tradeHistory.push({
    id: `trade-${Date.now()}`,
    symbol,
    side,
    price,
    quantity,
    pnl,
    timestamp: new Date()
  });
  
  if (tradeHistory.length > 1000) {
    tradeHistory.shift();
  }
}

export function getPosition(positionId: string): Position | undefined {
  return positions.get(positionId);
}

export function getAllPositions(): Position[] {
  return Array.from(positions.values());
}

export function getPositionsByWallet(walletAddress: string): Position[] {
  const positionIds = walletPortfolios.get(walletAddress);
  if (!positionIds) return [];
  
  return Array.from(positionIds)
    .map(id => positions.get(id))
    .filter((p): p is Position => p !== undefined);
}

export function getPortfolioMetrics(walletAddress?: string): PortfolioMetrics {
  const relevantPositions = walletAddress 
    ? getPositionsByWallet(walletAddress)
    : getAllPositions();
  
  const relevantTrades = walletAddress
    ? tradeHistory.filter(t => {
        const pos = Array.from(positions.values()).find(p => p.symbol === t.symbol);
        return pos?.walletAddress === walletAddress;
      })
    : tradeHistory;
  
  const totalValue = relevantPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
  const unrealizedPnL = relevantPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const realizedPnL = relevantTrades.reduce((sum, t) => sum + t.pnl, 0);
  
  const winningTrades = relevantTrades.filter(t => t.pnl > 0);
  const losingTrades = relevantTrades.filter(t => t.pnl < 0);
  
  const winRate = relevantTrades.length > 0 
    ? winningTrades.length / relevantTrades.length 
    : 0;
  
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
    : 0;
  
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
    : 0;
  
  return {
    totalValue,
    totalPnL: unrealizedPnL + realizedPnL,
    unrealizedPnL,
    realizedPnL,
    winRate,
    avgWin,
    avgLoss,
    sharpeRatio: calculateSharpeRatio(relevantTrades),
    maxDrawdown: calculateMaxDrawdown()
  };
}

function calculateSharpeRatio(trades: TradeHistory[]): number {
  if (trades.length < 2) return 0;
  
  const returns = trades.map(t => t.pnl);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  return avgReturn / stdDev;
}

function calculateMaxDrawdown(): number {
  if (portfolioSnapshots.length < 2) return 0;
  
  let maxDrawdown = 0;
  let peak = portfolioSnapshots[0].totalValue;
  
  for (const snapshot of portfolioSnapshots) {
    if (snapshot.totalValue > peak) {
      peak = snapshot.totalValue;
    }
    const drawdown = (peak - snapshot.totalValue) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return maxDrawdown;
}

export function takeSnapshot(): void {
  const metrics = getPortfolioMetrics();
  portfolioSnapshots.push({
    timestamp: new Date(),
    totalValue: metrics.totalValue,
    positions: positions.size,
    pnl: metrics.totalPnL
  });
  
  if (portfolioSnapshots.length > 1000) {
    portfolioSnapshots.shift();
  }
}

export function getTradeHistory(limit: number = 50): TradeHistory[] {
  return tradeHistory.slice(-limit);
}

export function getSnapshots(limit: number = 100): PortfolioSnapshot[] {
  return portfolioSnapshots.slice(-limit);
}
