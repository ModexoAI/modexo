import { useState, useEffect, useCallback } from 'react';

interface PhantomWallet {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  request(params: { method: string; params?: any }): Promise<any>;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}

declare global {
  interface Window {
    solana?: PhantomWallet;
    phantom?: { solana?: PhantomWallet };
  }
}

export interface UsePhantomReturn {
  phantom: PhantomWallet | null;
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isPhantomInstalled: boolean;
}

function getProvider(): PhantomWallet | null {
  if (typeof window === 'undefined') return null;
  
  if ('phantom' in window) {
    const provider = window.phantom?.solana;
    if (provider?.isPhantom) return provider;
  }
  
  if (window.solana?.isPhantom) {
    return window.solana;
  }
  
  return null;
}

export function usePhantom(): UsePhantomReturn {
  const [phantom, setPhantom] = useState<PhantomWallet | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const detectProvider = () => {
      const provider = getProvider();
      if (provider) {
        setPhantom(provider);
        if (provider.isConnected && provider.publicKey) {
          setConnected(true);
          setPublicKey(provider.publicKey.toString());
        }
      }
    };

    detectProvider();
    
    window.addEventListener('load', detectProvider);
    return () => window.removeEventListener('load', detectProvider);
  }, []);

  useEffect(() => {
    if (!phantom) return;

    const handleConnect = (pk: { toString(): string }) => {
      setConnected(true);
      setPublicKey(pk.toString());
      setConnecting(false);
    };

    const handleDisconnect = () => {
      setConnected(false);
      setPublicKey(null);
    };

    const handleAccountChanged = (pk: { toString(): string } | null) => {
      if (pk) {
        setPublicKey(pk.toString());
        setConnected(true);
      } else {
        setConnected(false);
        setPublicKey(null);
      }
    };

    phantom.on('connect', handleConnect);
    phantom.on('disconnect', handleDisconnect);
    phantom.on('accountChanged', handleAccountChanged);

    return () => {
      phantom.off('connect', handleConnect);
      phantom.off('disconnect', handleDisconnect);
      phantom.off('accountChanged', handleAccountChanged);
    };
  }, [phantom]);

  const connect = useCallback(async () => {
    let provider = phantom;
    
    if (!provider) {
      provider = getProvider();
      if (provider) setPhantom(provider);
    }
    
    if (!provider) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    if (connecting) return;

    try {
      setConnecting(true);
      
      const response = await provider.request({ method: 'connect' });
      
      if (response?.publicKey) {
        const pk = response.publicKey.toString();
        setPublicKey(pk);
        setConnected(true);
      }
    } catch (error: any) {
      if (error?.code === 4001) {
        console.log('User rejected connection request');
      } else {
        console.error('Wallet connection error:', error);
      }
    } finally {
      setConnecting(false);
    }
  }, [phantom, connecting]);

  const disconnect = useCallback(async () => {
    if (!phantom) return;
    try {
      await phantom.request({ method: 'disconnect' });
      setConnected(false);
      setPublicKey(null);
    } catch (error) {
      console.error('Wallet disconnect error:', error);
      setConnected(false);
      setPublicKey(null);
    }
  }, [phantom]);

  return {
    phantom,
    connected,
    connecting,
    publicKey,
    connect,
    disconnect,
    isPhantomInstalled: !!phantom,
  };
}
