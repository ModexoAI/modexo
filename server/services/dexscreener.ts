const DEXSCREENER_SERVICE_VERSION = "1.2.0";
const DEXSCREENER_API_BASE = "https://api.dexscreener.com";
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60000;
const RESPONSE_CACHE_TTL = 15000;
const PRICE_ALERT_CHECK_INTERVAL = 5000;

interface PriceAlert {
  id: string;
  tokenAddress: string;
  targetPrice: number;
  direction: "above" | "below";
  triggered: boolean;
  createdAt: number;
  triggeredAt?: number;
}

const priceAlerts = new Map<string, PriceAlert>();

function createPriceAlert(
  tokenAddress: string,
  targetPrice: number,
  direction: "above" | "below"
): string {
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  priceAlerts.set(id, {
    id,
    tokenAddress,
    targetPrice,
    direction,
    triggered: false,
    createdAt: Date.now(),
  });
  return id;
}

function checkPriceAlert(alertId: string, currentPrice: number): boolean {
  const alert = priceAlerts.get(alertId);
  if (!alert || alert.triggered) return false;

  const shouldTrigger =
    (alert.direction === "above" && currentPrice >= alert.targetPrice) ||
    (alert.direction === "below" && currentPrice <= alert.targetPrice);

  if (shouldTrigger) {
    alert.triggered = true;
    alert.triggeredAt = Date.now();
    return true;
  }

  return false;
}

function removePriceAlert(alertId: string): boolean {
  return priceAlerts.delete(alertId);
}

function getActiveAlerts(): PriceAlert[] {
  return Array.from(priceAlerts.values()).filter(a => !a.triggered);
}

function getTriggeredAlerts(): PriceAlert[] {
  return Array.from(priceAlerts.values()).filter(a => a.triggered);
}

function clearTriggeredAlerts(): number {
  let cleared = 0;
  for (const [id, alert] of priceAlerts) {
    if (alert.triggered) {
      priceAlerts.delete(id);
      cleared++;
    }
  }
  return cleared;
}

interface RequestMetrics {
  count: number;
  windowStart: number;
  lastRequest: number;
}

const metrics: RequestMetrics = {
  count: 0,
  windowStart: Date.now(),
  lastRequest: 0,
};

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  
  if (now - metrics.windowStart > RATE_LIMIT_WINDOW_MS) {
    metrics.count = 0;
    metrics.windowStart = now;
  }
  
  if (metrics.count >= RATE_LIMIT_REQUESTS) {
    const retryAfter = RATE_LIMIT_WINDOW_MS - (now - metrics.windowStart);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

function recordRequest(): void {
  metrics.count++;
  metrics.lastRequest = Date.now();
}

interface PriceCache {
  [tokenAddress: string]: { price: number; timestamp: number };
}

const priceCache: PriceCache = {};

function getCachedPrice(tokenAddress: string): number | null {
  const cached = priceCache[tokenAddress];
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > RESPONSE_CACHE_TTL) {
    delete priceCache[tokenAddress];
    return null;
  }
  
  return cached.price;
}

function cachePrice(tokenAddress: string, price: number): void {
  priceCache[tokenAddress] = { price, timestamp: Date.now() };
}

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

interface TokenSearchResult {
  pairs: DexPair[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 15 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

export async function getTokenPairs(tokenAddress: string): Promise<DexPair[]> {
  const cacheKey = `token:${tokenAddress}`;
  const cached = getCached<DexPair[]>(cacheKey);
  if (cached) return cached;

  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const response = await fetchWithRetry(url);
  const data: TokenSearchResult = await response.json();
  
  const pairs = data.pairs || [];
  setCache(cacheKey, pairs);
  return pairs;
}

export async function getMultipleTokens(tokenAddresses: string[]): Promise<DexPair[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < tokenAddresses.length; i += 30) {
    chunks.push(tokenAddresses.slice(i, i + 30));
  }

  const allPairs: DexPair[] = [];
  
  for (const chunk of chunks) {
    const addresses = chunk.join(",");
    const cacheKey = `tokens:${addresses}`;
    const cached = getCached<DexPair[]>(cacheKey);
    
    if (cached) {
      allPairs.push(...cached);
      continue;
    }

    const url = `https://api.dexscreener.com/tokens/v1/solana/${addresses}`;
    const response = await fetchWithRetry(url);
    const pairs: DexPair[] = await response.json();
    
    setCache(cacheKey, pairs);
    allPairs.push(...pairs);
  }

  return allPairs;
}

export async function searchPairs(query: string): Promise<DexPair[]> {
  const cacheKey = `search:${query}`;
  const cached = getCached<DexPair[]>(cacheKey);
  if (cached) return cached;

  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url);
  const data: TokenSearchResult = await response.json();
  
  const solanaPairs = (data.pairs || []).filter(p => p.chainId === "solana");
  setCache(cacheKey, solanaPairs);
  return solanaPairs;
}

export async function getTrendingSolana(): Promise<DexPair[]> {
  const cacheKey = "trending:solana";
  const cached = getCached<DexPair[]>(cacheKey);
  if (cached) return cached;

  const allTokenAddresses: string[] = [];

  // Focus on boosted/trending tokens (higher quality)
  try {
    const boostsUrl = "https://api.dexscreener.com/token-boosts/top/v1";
    const boostsResponse = await fetchWithRetry(boostsUrl);
    const boosts: { tokenAddress: string; chainId: string }[] = await boostsResponse.json();
    
    const boostsSolana = boosts
      .filter(b => b.chainId === "solana")
      .slice(0, 30)
      .map(b => b.tokenAddress);
    allTokenAddresses.push(...boostsSolana);
  } catch (error) {
    console.error("Error fetching boosts:", error);
  }

  if (allTokenAddresses.length === 0) return [];
  
  const pairs = await getMultipleTokens(allTokenAddresses);
  
  // Filter for quality tokens only
  const qualityPairs = pairs.filter(p => {
    const liquidity = p.liquidity?.usd ?? 0;
    const volume = p.volume?.h24 ?? 0;
    const txns = (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0);
    return liquidity >= 5000 && volume >= 1000 && txns >= 50;
  });
  
  setCache(cacheKey, qualityPairs);
  return qualityPairs;
}

export function calculateSafetyScore(pair: DexPair): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 100;

  const liquidityUsd = pair.liquidity?.usd ?? 0;
  if (liquidityUsd < 10000) {
    flags.push("low_liquidity");
    score -= 25;
  } else if (liquidityUsd < 50000) {
    flags.push("medium_liquidity");
    score -= 10;
  }

  if (!pair.info?.websites?.length) {
    flags.push("no_website");
    score -= 15;
  }

  if (!pair.info?.socials?.length) {
    flags.push("no_socials");
    score -= 10;
  }

  const buys = pair.txns?.h24?.buys ?? 0;
  const sells = pair.txns?.h24?.sells ?? 0;
  const buyRatio = buys / (buys + sells || 1);
  if (buyRatio < 0.3 || buyRatio > 0.9) {
    flags.push("skewed_txn_ratio");
    score -= 15;
  }

  const priceChange24h = pair.priceChange?.h24 ?? 0;
  if (priceChange24h < -50) {
    flags.push("major_dump");
    score -= 20;
  } else if (priceChange24h > 500) {
    flags.push("possible_pump");
    score -= 10;
  }

  const volume24h = pair.volume?.h24 ?? 0;
  if (volume24h < 1000) {
    flags.push("low_volume");
    score -= 15;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    flags,
  };
}

export function pairToTokenSnapshot(pair: DexPair) {
  const { score, flags } = calculateSafetyScore(pair);
  
  const volume24h = pair.volume?.h24 ?? 0;
  const buys = pair.txns?.h24?.buys ?? 0;
  const sells = pair.txns?.h24?.sells ?? 0;
  const priceChange24h = pair.priceChange?.h24 ?? 0;
  const liquidityUsd = pair.liquidity?.usd ?? 0;
  
  const trendingScore = 
    (volume24h / 100000) * 0.3 +
    (buys + sells) * 0.02 +
    (priceChange24h > 0 ? priceChange24h * 0.1 : 0) +
    (liquidityUsd / 50000) * 0.2;

  return {
    tokenAddress: pair.baseToken?.address ?? "",
    pairAddress: pair.pairAddress ?? "",
    dexId: pair.dexId ?? "",
    symbol: pair.baseToken?.symbol ?? "???",
    name: pair.baseToken?.name ?? "Unknown",
    priceUsd: parseFloat(pair.priceUsd) || 0,
    priceNative: parseFloat(pair.priceNative) || 0,
    priceChange5m: pair.priceChange?.m5 ?? 0,
    priceChange1h: pair.priceChange?.h1 ?? 0,
    priceChange6h: pair.priceChange?.h6 ?? 0,
    priceChange24h: priceChange24h,
    liquidityUsd: liquidityUsd,
    fdvUsd: pair.fdv ?? 0,
    marketCapUsd: pair.marketCap ?? 0,
    volumeH24Usd: volume24h,
    txBuysH24: buys,
    txSellsH24: sells,
    trendingScore: Math.round(trendingScore * 100) / 100,
    safetyScore: score,
    riskFlags: flags,
    imageUrl: pair.info?.imageUrl ?? null,
  };
}

export interface LiquidityAnalysis {
  tokenAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  currentPrice: number;
  liquidity: {
    totalUsd: number;
    baseAmount: number;
    quoteAmount: number;
    depth: 'deep' | 'moderate' | 'shallow' | 'critical';
  };
  concentration: {
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    topPoolShare: number;
    poolCount: number;
  };
  slippage: {
    estimated1k: number;
    estimated10k: number;
    estimated50k: number;
  };
  metrics: {
    liquidityToMcap: number;
    volumeToLiquidity: number;
    healthScore: number;
  };
  dexDistribution: Array<{
    name: string;
    liquidity: number;
    share: number;
  }>;
  warnings: string[];
  recommendation: 'safe' | 'moderate' | 'caution' | 'avoid';
}

export async function analyzeLiquidity(tokenAddress: string): Promise<LiquidityAnalysis | null> {
  const pairs = await getTokenPairs(tokenAddress);
  if (!pairs.length) return null;

  const sortedPairs = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const mainPair = sortedPairs[0];
  
  const currentPrice = parseFloat(mainPair.priceUsd) || 0;
  if (currentPrice === 0) return null;

  const totalLiquidity = sortedPairs.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
  const baseLiquidity = mainPair.liquidity?.base ?? 0;
  const quoteLiquidity = mainPair.liquidity?.quote ?? 0;
  const marketCap = mainPair.marketCap ?? mainPair.fdv ?? 0;
  const volume24h = mainPair.volume?.h24 ?? 0;

  let depth: 'deep' | 'moderate' | 'shallow' | 'critical';
  if (totalLiquidity >= 500000) depth = 'deep';
  else if (totalLiquidity >= 100000) depth = 'moderate';
  else if (totalLiquidity >= 20000) depth = 'shallow';
  else depth = 'critical';

  const topPoolShare = mainPair.liquidity?.usd ? (mainPair.liquidity.usd / totalLiquidity) * 100 : 100;
  let concentrationRisk: 'low' | 'medium' | 'high' | 'extreme';
  if (topPoolShare < 50 && sortedPairs.length >= 3) concentrationRisk = 'low';
  else if (topPoolShare < 70 && sortedPairs.length >= 2) concentrationRisk = 'medium';
  else if (topPoolShare < 90) concentrationRisk = 'high';
  else concentrationRisk = 'extreme';

  const slippage1k = totalLiquidity > 0 ? Math.min((1000 / totalLiquidity) * 100 * 1.5, 50) : 50;
  const slippage10k = totalLiquidity > 0 ? Math.min((10000 / totalLiquidity) * 100 * 1.5, 50) : 50;
  const slippage50k = totalLiquidity > 0 ? Math.min((50000 / totalLiquidity) * 100 * 1.5, 50) : 50;

  const liquidityToMcap = marketCap > 0 ? (totalLiquidity / marketCap) * 100 : 0;
  const volumeToLiquidity = totalLiquidity > 0 ? (volume24h / totalLiquidity) * 100 : 0;

  let healthScore = 50;
  if (totalLiquidity >= 500000) healthScore += 20;
  else if (totalLiquidity >= 100000) healthScore += 10;
  else if (totalLiquidity < 20000) healthScore -= 15;
  
  if (liquidityToMcap >= 10) healthScore += 15;
  else if (liquidityToMcap >= 5) healthScore += 8;
  else if (liquidityToMcap < 2) healthScore -= 10;
  
  if (concentrationRisk === 'low') healthScore += 10;
  else if (concentrationRisk === 'extreme') healthScore -= 15;
  
  if (sortedPairs.length >= 3) healthScore += 5;
  
  healthScore = Math.max(0, Math.min(100, healthScore));

  const dexDistribution = sortedPairs.slice(0, 5).map(p => ({
    name: p.dexId?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? 'Unknown',
    liquidity: p.liquidity?.usd ?? 0,
    share: totalLiquidity > 0 ? ((p.liquidity?.usd ?? 0) / totalLiquidity) * 100 : 0,
  }));

  const warnings: string[] = [];
  if (depth === 'critical') warnings.push('Critical liquidity - high slippage risk');
  if (depth === 'shallow') warnings.push('Low liquidity - trade with caution');
  if (concentrationRisk === 'extreme') warnings.push('Single pool concentration risk');
  if (concentrationRisk === 'high') warnings.push('High pool concentration');
  if (liquidityToMcap < 2) warnings.push('Low liquidity relative to market cap');
  if (volumeToLiquidity > 200) warnings.push('Unusual volume/liquidity ratio');
  if (sortedPairs.length === 1) warnings.push('Only one trading pool available');

  let recommendation: 'safe' | 'moderate' | 'caution' | 'avoid';
  if (healthScore >= 70 && depth !== 'critical' && concentrationRisk !== 'extreme') {
    recommendation = 'safe';
  } else if (healthScore >= 50 && depth !== 'critical') {
    recommendation = 'moderate';
  } else if (healthScore >= 30) {
    recommendation = 'caution';
  } else {
    recommendation = 'avoid';
  }

  return {
    tokenAddress: mainPair.baseToken?.address ?? tokenAddress,
    symbol: mainPair.baseToken?.symbol ?? '???',
    name: mainPair.baseToken?.name ?? 'Unknown',
    imageUrl: mainPair.info?.imageUrl ?? null,
    currentPrice,
    liquidity: {
      totalUsd: Math.round(totalLiquidity),
      baseAmount: baseLiquidity,
      quoteAmount: quoteLiquidity,
      depth,
    },
    concentration: {
      riskLevel: concentrationRisk,
      topPoolShare: Math.round(topPoolShare * 10) / 10,
      poolCount: sortedPairs.length,
    },
    slippage: {
      estimated1k: Math.round(slippage1k * 100) / 100,
      estimated10k: Math.round(slippage10k * 100) / 100,
      estimated50k: Math.round(slippage50k * 100) / 100,
    },
    metrics: {
      liquidityToMcap: Math.round(liquidityToMcap * 100) / 100,
      volumeToLiquidity: Math.round(volumeToLiquidity * 100) / 100,
      healthScore,
    },
    dexDistribution,
    warnings,
    recommendation,
  };
}
