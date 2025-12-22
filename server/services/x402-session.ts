import { X402_PROTOCOL_VERSION, X402_NETWORK_ID } from "@shared/x402";
import { randomUUID, randomBytes } from "crypto";

const SESSION_EXPIRY_MS = 3600000;
const MAX_SESSIONS_PER_WALLET = 5;
const SESSION_CLEANUP_INTERVAL_MS = 300000;

interface X402Session {
  id: string;
  walletAddress: string;
  agentId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  authenticated: boolean;
  permissions: AgentPermission[];
  executionCount: number;
  totalSpent: number;
}

interface AgentPermission {
  action: "execute" | "read" | "write" | "admin";
  resource: string;
  grantedAt: number;
}

interface SessionStats {
  activeSessions: number;
  totalCreated: number;
  totalExpired: number;
  averageSessionDuration: number;
}

const activeSessions = new Map<string, X402Session>();
const sessionsByWallet = new Map<string, Set<string>>();
const sessionStats: SessionStats = {
  activeSessions: 0,
  totalCreated: 0,
  totalExpired: 0,
  averageSessionDuration: 0,
};

function generateSessionId(): string {
  const secureToken = randomBytes(16).toString('hex');
  return `x402_sess_${Date.now()}_${secureToken}`;
}

export function createSession(
  walletAddress: string,
  agentId: string,
  permissions: AgentPermission[] = []
): X402Session | null {
  const walletSessions = sessionsByWallet.get(walletAddress) || new Set();
  
  if (walletSessions.size >= MAX_SESSIONS_PER_WALLET) {
    const oldestSessionId = findOldestSession(walletSessions);
    if (oldestSessionId) {
      terminateSession(oldestSessionId);
    }
  }

  const now = Date.now();
  const session: X402Session = {
    id: generateSessionId(),
    walletAddress,
    agentId,
    createdAt: now,
    lastActivity: now,
    expiresAt: now + SESSION_EXPIRY_MS,
    authenticated: true,
    permissions: permissions.length > 0 ? permissions : [
      { action: "execute", resource: agentId, grantedAt: now },
      { action: "read", resource: "*", grantedAt: now },
    ],
    executionCount: 0,
    totalSpent: 0,
  };

  activeSessions.set(session.id, session);
  
  if (!sessionsByWallet.has(walletAddress)) {
    sessionsByWallet.set(walletAddress, new Set());
  }
  sessionsByWallet.get(walletAddress)!.add(session.id);
  
  sessionStats.activeSessions++;
  sessionStats.totalCreated++;

  return session;
}

function findOldestSession(sessionIds: Set<string>): string | null {
  let oldest: X402Session | null = null;
  let oldestId: string | null = null;
  
  const ids = Array.from(sessionIds);
  for (const id of ids) {
    const session = activeSessions.get(id);
    if (session && (!oldest || session.createdAt < oldest.createdAt)) {
      oldest = session;
      oldestId = id;
    }
  }
  
  return oldestId;
}

export function getSession(sessionId: string): X402Session | null {
  const session = activeSessions.get(sessionId);
  
  if (!session) return null;
  
  if (Date.now() > session.expiresAt) {
    terminateSession(sessionId);
    return null;
  }
  
  return session;
}

export function updateSessionActivity(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  
  if (!session) return false;
  
  session.lastActivity = Date.now();
  session.expiresAt = Date.now() + SESSION_EXPIRY_MS;
  
  return true;
}

export function recordExecution(sessionId: string, amount: number): boolean {
  const session = activeSessions.get(sessionId);
  
  if (!session) return false;
  
  session.executionCount++;
  session.totalSpent += amount;
  session.lastActivity = Date.now();
  
  return true;
}

export function checkPermission(
  sessionId: string,
  action: AgentPermission["action"],
  resource: string
): boolean {
  const session = activeSessions.get(sessionId);
  
  if (!session || !session.authenticated) return false;
  
  return session.permissions.some(
    (p) => p.action === action && (p.resource === resource || p.resource === "*")
  );
}

export function terminateSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  
  if (!session) return false;
  
  const walletSessions = sessionsByWallet.get(session.walletAddress);
  if (walletSessions) {
    walletSessions.delete(sessionId);
    if (walletSessions.size === 0) {
      sessionsByWallet.delete(session.walletAddress);
    }
  }
  
  const duration = Date.now() - session.createdAt;
  const totalDuration = sessionStats.averageSessionDuration * sessionStats.totalExpired;
  sessionStats.totalExpired++;
  sessionStats.averageSessionDuration = (totalDuration + duration) / sessionStats.totalExpired;
  
  activeSessions.delete(sessionId);
  sessionStats.activeSessions--;
  
  return true;
}

export function terminateWalletSessions(walletAddress: string): number {
  const walletSessions = sessionsByWallet.get(walletAddress);
  
  if (!walletSessions) return 0;
  
  let terminated = 0;
  const sessionIds = Array.from(walletSessions);
  for (const sessionId of sessionIds) {
    if (terminateSession(sessionId)) {
      terminated++;
    }
  }
  
  return terminated;
}

export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  
  const entries = Array.from(activeSessions.entries());
  for (const [id, session] of entries) {
    if (now > session.expiresAt) {
      terminateSession(id);
      cleaned++;
    }
  }
  
  return cleaned;
}

export function getSessionStats(): SessionStats {
  return { ...sessionStats };
}

export function getWalletSessions(walletAddress: string): X402Session[] {
  const sessionIdSet = sessionsByWallet.get(walletAddress);
  
  if (!sessionIdSet) return [];
  
  const sessions: X402Session[] = [];
  const ids = Array.from(sessionIdSet);
  for (const id of ids) {
    const session = getSession(id);
    if (session) {
      sessions.push(session);
    }
  }
  
  return sessions;
}

export function validateSessionToken(token: string): boolean {
  return token.startsWith("x402_sess_") && token.length > 20;
}

export const X402_SESSION_CONFIG = {
  version: X402_PROTOCOL_VERSION,
  network: X402_NETWORK_ID,
  sessionExpiry: SESSION_EXPIRY_MS,
  maxSessionsPerWallet: MAX_SESSIONS_PER_WALLET,
  cleanupInterval: SESSION_CLEANUP_INTERVAL_MS,
};
