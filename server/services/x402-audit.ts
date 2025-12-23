import { X402_PROTOCOL_VERSION, X402_NETWORK_ID } from "@shared/x402";
import { randomBytes, createHash } from "crypto";

const AUDIT_RETENTION_DAYS = 90;
const MAX_ENTRIES_PER_QUERY = 1000;
const HASH_ALGORITHM = "sha256";

type AuditAction = 
  | "payment.initiated"
  | "payment.completed"
  | "payment.failed"
  | "session.created"
  | "session.terminated"
  | "escrow.created"
  | "escrow.released"
  | "escrow.disputed"
  | "wallet.connected"
  | "wallet.disconnected"
  | "permission.granted"
  | "permission.revoked"
  | "config.updated";

type AuditSeverity = "info" | "warning" | "critical";

interface AuditEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  severity: AuditSeverity;
  walletAddress: string;
  agentId?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  previousHash: string;
  entryHash: string;
}

interface AuditChain {
  genesisHash: string;
  latestHash: string;
  totalEntries: number;
  createdAt: number;
  lastEntryAt: number;
}

interface AuditQuery {
  walletAddress?: string;
  agentId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

interface AuditMetrics {
  totalEntries: number;
  entriesByAction: Record<string, number>;
  entriesBySeverity: Record<AuditSeverity, number>;
  uniqueWallets: number;
  chainIntegrity: boolean;
}

const auditLog: AuditEntry[] = [];
const auditByWallet = new Map<string, string[]>();
const auditByAgent = new Map<string, string[]>();
const auditChain: AuditChain = {
  genesisHash: "",
  latestHash: "",
  totalEntries: 0,
  createdAt: 0,
  lastEntryAt: 0,
};

function generateAuditId(): string {
  const secureToken = randomBytes(16).toString('hex');
  return `x402_audit_${Date.now()}_${secureToken}`;
}

function calculateEntryHash(entry: Omit<AuditEntry, 'entryHash'>): string {
  const payload = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    walletAddress: entry.walletAddress,
    details: entry.details,
    previousHash: entry.previousHash,
  });
  return createHash(HASH_ALGORITHM).update(payload).digest('hex');
}

function initializeChain(): void {
  if (auditChain.genesisHash === "") {
    const genesisPayload = `x402_audit_genesis_${Date.now()}`;
    auditChain.genesisHash = createHash(HASH_ALGORITHM).update(genesisPayload).digest('hex');
    auditChain.latestHash = auditChain.genesisHash;
    auditChain.createdAt = Date.now();
  }
}

export function recordAuditEntry(
  action: AuditAction,
  walletAddress: string,
  details: Record<string, unknown>,
  options: {
    agentId?: string;
    resourceId?: string;
    severity?: AuditSeverity;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): AuditEntry {
  initializeChain();

  const entryBase = {
    id: generateAuditId(),
    timestamp: Date.now(),
    action,
    severity: options.severity || determineSeverity(action),
    walletAddress,
    agentId: options.agentId,
    resourceId: options.resourceId,
    details,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    previousHash: auditChain.latestHash,
  };

  const entryHash = calculateEntryHash(entryBase);
  const entry: AuditEntry = { ...entryBase, entryHash };

  auditLog.push(entry);
  auditChain.latestHash = entryHash;
  auditChain.totalEntries++;
  auditChain.lastEntryAt = entry.timestamp;

  if (!auditByWallet.has(walletAddress)) {
    auditByWallet.set(walletAddress, []);
  }
  auditByWallet.get(walletAddress)!.push(entry.id);

  if (options.agentId) {
    if (!auditByAgent.has(options.agentId)) {
      auditByAgent.set(options.agentId, []);
    }
    auditByAgent.get(options.agentId)!.push(entry.id);
  }

  return entry;
}

function determineSeverity(action: AuditAction): AuditSeverity {
  const criticalActions: AuditAction[] = [
    "payment.failed",
    "escrow.disputed",
    "permission.revoked",
  ];
  
  const warningActions: AuditAction[] = [
    "session.terminated",
    "wallet.disconnected",
    "config.updated",
  ];

  if (criticalActions.includes(action)) return "critical";
  if (warningActions.includes(action)) return "warning";
  return "info";
}

export function queryAuditLog(query: AuditQuery): AuditEntry[] {
  let results = [...auditLog];

  if (query.walletAddress) {
    results = results.filter(e => e.walletAddress === query.walletAddress);
  }

  if (query.agentId) {
    results = results.filter(e => e.agentId === query.agentId);
  }

  if (query.action) {
    results = results.filter(e => e.action === query.action);
  }

  if (query.severity) {
    results = results.filter(e => e.severity === query.severity);
  }

  if (query.startTime) {
    results = results.filter(e => e.timestamp >= query.startTime!);
  }

  if (query.endTime) {
    results = results.filter(e => e.timestamp <= query.endTime!);
  }

  results.sort((a, b) => b.timestamp - a.timestamp);

  const offset = query.offset || 0;
  const limit = Math.min(query.limit || MAX_ENTRIES_PER_QUERY, MAX_ENTRIES_PER_QUERY);

  return results.slice(offset, offset + limit);
}

export function getAuditEntry(entryId: string): AuditEntry | null {
  return auditLog.find(e => e.id === entryId) || null;
}

export function getWalletAuditHistory(
  walletAddress: string,
  limit: number = 100
): AuditEntry[] {
  const entryIds = auditByWallet.get(walletAddress) || [];
  const entries: AuditEntry[] = [];

  const recentIds = entryIds.slice(-limit).reverse();
  for (const id of recentIds) {
    const entry = auditLog.find(e => e.id === id);
    if (entry) entries.push(entry);
  }

  return entries;
}

export function getAgentAuditHistory(
  agentId: string,
  limit: number = 100
): AuditEntry[] {
  const entryIds = auditByAgent.get(agentId) || [];
  const entries: AuditEntry[] = [];

  const recentIds = entryIds.slice(-limit).reverse();
  for (const id of recentIds) {
    const entry = auditLog.find(e => e.id === id);
    if (entry) entries.push(entry);
  }

  return entries;
}

export function verifyChainIntegrity(): { valid: boolean; brokenAt?: string } {
  if (auditLog.length === 0) {
    return { valid: true };
  }

  let expectedPreviousHash = auditChain.genesisHash;

  for (const entry of auditLog) {
    if (entry.previousHash !== expectedPreviousHash) {
      return { valid: false, brokenAt: entry.id };
    }

    const calculatedHash = calculateEntryHash({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      severity: entry.severity,
      walletAddress: entry.walletAddress,
      agentId: entry.agentId,
      resourceId: entry.resourceId,
      details: entry.details,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      previousHash: entry.previousHash,
    });

    if (calculatedHash !== entry.entryHash) {
      return { valid: false, brokenAt: entry.id };
    }

    expectedPreviousHash = entry.entryHash;
  }

  return { valid: true };
}

export function getAuditMetrics(): AuditMetrics {
  const entriesByAction: Record<string, number> = {};
  const entriesBySeverity: Record<AuditSeverity, number> = {
    info: 0,
    warning: 0,
    critical: 0,
  };
  const uniqueWallets = new Set<string>();

  for (const entry of auditLog) {
    entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
    entriesBySeverity[entry.severity]++;
    uniqueWallets.add(entry.walletAddress);
  }

  const integrity = verifyChainIntegrity();

  return {
    totalEntries: auditLog.length,
    entriesByAction,
    entriesBySeverity,
    uniqueWallets: uniqueWallets.size,
    chainIntegrity: integrity.valid,
  };
}

export function getAuditChainInfo(): AuditChain {
  return { ...auditChain };
}

export function exportAuditRange(
  startTime: number,
  endTime: number
): AuditEntry[] {
  return auditLog.filter(
    e => e.timestamp >= startTime && e.timestamp <= endTime
  );
}

export function getRecentCriticalEntries(limit: number = 50): AuditEntry[] {
  return auditLog
    .filter(e => e.severity === "critical")
    .slice(-limit)
    .reverse();
}

export function cleanupOldEntries(): number {
  const cutoff = Date.now() - (AUDIT_RETENTION_DAYS * 86400000);
  let cleaned = 0;

  while (auditLog.length > 0 && auditLog[0].timestamp < cutoff) {
    const entry = auditLog.shift()!;
    
    const walletEntries = auditByWallet.get(entry.walletAddress);
    if (walletEntries) {
      const index = walletEntries.indexOf(entry.id);
      if (index !== -1) walletEntries.splice(index, 1);
    }

    if (entry.agentId) {
      const agentEntries = auditByAgent.get(entry.agentId);
      if (agentEntries) {
        const index = agentEntries.indexOf(entry.id);
        if (index !== -1) agentEntries.splice(index, 1);
      }
    }

    cleaned++;
  }

  return cleaned;
}

export function generateComplianceReport(
  walletAddress: string,
  startTime: number,
  endTime: number
): {
  walletAddress: string;
  period: { start: number; end: number };
  totalTransactions: number;
  successfulPayments: number;
  failedPayments: number;
  disputedEscrows: number;
  sessionCount: number;
  riskScore: number;
} {
  const entries = queryAuditLog({
    walletAddress,
    startTime,
    endTime,
    limit: MAX_ENTRIES_PER_QUERY,
  });

  let successfulPayments = 0;
  let failedPayments = 0;
  let disputedEscrows = 0;
  let sessionCount = 0;

  for (const entry of entries) {
    switch (entry.action) {
      case "payment.completed":
        successfulPayments++;
        break;
      case "payment.failed":
        failedPayments++;
        break;
      case "escrow.disputed":
        disputedEscrows++;
        break;
      case "session.created":
        sessionCount++;
        break;
    }
  }

  const totalTransactions = successfulPayments + failedPayments;
  const failureRate = totalTransactions > 0 ? failedPayments / totalTransactions : 0;
  const disputeRate = successfulPayments > 0 ? disputedEscrows / successfulPayments : 0;
  const riskScore = Math.min(100, Math.round((failureRate * 50) + (disputeRate * 50)));

  return {
    walletAddress,
    period: { start: startTime, end: endTime },
    totalTransactions,
    successfulPayments,
    failedPayments,
    disputedEscrows,
    sessionCount,
    riskScore,
  };
}

export const X402_AUDIT_CONFIG = {
  version: X402_PROTOCOL_VERSION,
  network: X402_NETWORK_ID,
  retentionDays: AUDIT_RETENTION_DAYS,
  maxEntriesPerQuery: MAX_ENTRIES_PER_QUERY,
  hashAlgorithm: HASH_ALGORITHM,
};
