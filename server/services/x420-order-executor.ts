interface OrderParams {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  amount: number;
  price?: number;
  stopPrice?: number;
  walletAddress: string;
  slippage: number;
}

interface OrderResult {
  orderId: string;
  status: "pending" | "filled" | "partial" | "cancelled" | "failed";
  filledAmount: number;
  avgPrice: number;
  fees: number;
  timestamp: Date;
  txSignature?: string;
}

interface ExecutionConfig {
  maxSlippage: number;
  retryAttempts: number;
  retryDelayMs: number;
  minOrderSize: number;
  maxOrderSize: number;
}

interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  spread: number;
  midPrice: number;
}

const activeOrders: Map<string, OrderParams> = new Map();
const orderHistory: Map<string, OrderResult> = new Map();
const executionQueue: OrderParams[] = [];

const defaultConfig: ExecutionConfig = {
  maxSlippage: 0.02,
  retryAttempts: 3,
  retryDelayMs: 1000,
  minOrderSize: 1,
  maxOrderSize: 100000
};

let config: ExecutionConfig = { ...defaultConfig };

export function updateConfig(newConfig: Partial<ExecutionConfig>): void {
  config = { ...config, ...newConfig };
}

export function getConfig(): ExecutionConfig {
  return { ...config };
}

export async function submitOrder(params: OrderParams): Promise<OrderResult> {
  validateOrder(params);
  
  activeOrders.set(params.id, params);
  executionQueue.push(params);
  
  const result = await executeOrder(params);
  
  activeOrders.delete(params.id);
  orderHistory.set(params.id, result);
  
  return result;
}

function validateOrder(params: OrderParams): void {
  if (!params.symbol || params.symbol.length === 0) {
    throw new Error("Invalid symbol");
  }
  
  if (params.amount < config.minOrderSize) {
    throw new Error(`Order size below minimum: ${config.minOrderSize}`);
  }
  
  if (params.amount > config.maxOrderSize) {
    throw new Error(`Order size above maximum: ${config.maxOrderSize}`);
  }
  
  if (params.slippage > config.maxSlippage) {
    throw new Error(`Slippage exceeds maximum: ${config.maxSlippage}`);
  }
  
  if (params.type === "limit" && !params.price) {
    throw new Error("Limit orders require a price");
  }
  
  if (params.type === "stop" && !params.stopPrice) {
    throw new Error("Stop orders require a stop price");
  }
}

async function executeOrder(params: OrderParams): Promise<OrderResult> {
  let attempts = 0;
  let lastError: Error | null = null;
  
  while (attempts < config.retryAttempts) {
    try {
      const result = await attemptExecution(params);
      return result;
    } catch (error) {
      lastError = error as Error;
      attempts++;
      
      if (attempts < config.retryAttempts) {
        await delay(config.retryDelayMs * attempts);
      }
    }
  }
  
  return {
    orderId: params.id,
    status: "failed",
    filledAmount: 0,
    avgPrice: 0,
    fees: 0,
    timestamp: new Date()
  };
}

async function attemptExecution(params: OrderParams): Promise<OrderResult> {
  const orderBook = await fetchOrderBook(params.symbol);
  const executionPrice = calculateExecutionPrice(params, orderBook);
  
  const slippageCheck = checkSlippage(params, executionPrice);
  if (!slippageCheck.acceptable) {
    throw new Error(`Slippage too high: ${slippageCheck.actual}`);
  }
  
  const fees = calculateFees(params.amount, executionPrice);
  
  return {
    orderId: params.id,
    status: "filled",
    filledAmount: params.amount,
    avgPrice: executionPrice,
    fees,
    timestamp: new Date(),
    txSignature: generateTxSignature()
  };
}

async function fetchOrderBook(symbol: string): Promise<OrderBook> {
  const midPrice = 100 + Math.random() * 10;
  const spread = midPrice * 0.001;
  
  return {
    bids: [
      { price: midPrice - spread, size: 1000 },
      { price: midPrice - spread * 2, size: 2000 },
      { price: midPrice - spread * 3, size: 3000 }
    ],
    asks: [
      { price: midPrice + spread, size: 1000 },
      { price: midPrice + spread * 2, size: 2000 },
      { price: midPrice + spread * 3, size: 3000 }
    ],
    spread,
    midPrice
  };
}

function calculateExecutionPrice(params: OrderParams, orderBook: OrderBook): number {
  if (params.type === "limit" && params.price) {
    return params.price;
  }
  
  if (params.side === "buy") {
    return orderBook.asks[0].price;
  } else {
    return orderBook.bids[0].price;
  }
}

function checkSlippage(params: OrderParams, executionPrice: number): { acceptable: boolean; actual: number } {
  if (!params.price) {
    return { acceptable: true, actual: 0 };
  }
  
  const slippage = Math.abs(executionPrice - params.price) / params.price;
  return {
    acceptable: slippage <= params.slippage,
    actual: slippage
  };
}

function calculateFees(amount: number, price: number): number {
  const feeRate = 0.001;
  return amount * price * feeRate;
}

function generateTxSignature(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 88; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getActiveOrders(): OrderParams[] {
  return Array.from(activeOrders.values());
}

export function getOrderHistory(limit: number = 50): OrderResult[] {
  return Array.from(orderHistory.values()).slice(-limit);
}

export function getOrderById(orderId: string): OrderResult | undefined {
  return orderHistory.get(orderId);
}

export function cancelOrder(orderId: string): boolean {
  if (activeOrders.has(orderId)) {
    activeOrders.delete(orderId);
    orderHistory.set(orderId, {
      orderId,
      status: "cancelled",
      filledAmount: 0,
      avgPrice: 0,
      fees: 0,
      timestamp: new Date()
    });
    return true;
  }
  return false;
}

export function getExecutionStats(): { total: number; filled: number; failed: number; cancelled: number } {
  const results = Array.from(orderHistory.values());
  return {
    total: results.length,
    filled: results.filter(r => r.status === "filled").length,
    failed: results.filter(r => r.status === "failed").length,
    cancelled: results.filter(r => r.status === "cancelled").length
  };
}
