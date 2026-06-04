'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  calculatePrices,
  estimateShares,
  getMarketStatus,
  shortenAddress,
  timeUntil,
  formatSol,
  guessCategory,
  type MarketWithKey,
  type UserPositionAccount,
} from '../lib/market-utils';
import { findVaultPDA, findCreatorFeeVaultPDA, findPositionPDA, findTreasuryPDA } from '../lib/pda';
import { PROTOCOL_ADMIN } from '../lib/constants';

interface MarketDetailProps {
  market: MarketWithKey;
  program: Program | null;
  onBack: () => void;
  onRefresh: () => void;
}

export default function MarketDetail({ market, program, onBack, onRefresh }: MarketDetailProps) {
  const t = useTranslations();
  const { publicKey } = useWallet();
  const m = market.account;
  const marketPDA = new PublicKey(market.publicKey.toString());
  const [marketData, setMarketData] = useState(m);
  const status = getMarketStatus(marketData);
  const { yesPrice, noPrice } = calculatePrices(m.yesPool.toNumber(), m.noPool.toNumber());
  const category = guessCategory(m.question);

  const [buyAmount, setBuyAmount] = useState('0.01');
  const [isYes, setIsYes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [vaultBalances, setVaultBalances] = useState<Record<string, number>>({});
  const [statusMsg, setStatusMsg] = useState('');
  const [position, setPosition] = useState<UserPositionAccount | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ time: string; yes: number; no: number }[]>([]);
  const [claimAmount, setClaimAmount] = useState<number | null>(null);
  const [vaultBal, setVaultBal] = useState<number>(0);
  
  const loadPosition = useCallback(async () => {
    if (!program || !publicKey) return;
    try {
      const [positionPDA] = findPositionPDA(marketPDA, publicKey);
      const pos = await (program.account as any).userPosition.fetch(positionPDA);
      setPosition(pos as unknown as UserPositionAccount);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Account does not exist') || msg.includes('Could not find')) {
        setPosition(null);
      } else {
        console.error('Failed to load user position:', e);
        setPosition(null);
      }
    }
  }, [program, publicKey, marketPDA]);

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

  // Reset the transient "claimed" amount when switching markets or wallets so a
  // previous claim's result is never shown on an unrelated market.
  useEffect(() => {
    setClaimAmount(null);
  }, [market.publicKey.toString(), publicKey?.toString()]);

  const isCreator = !!publicKey && publicKey.toString() === m.creator.toString();
  const isAdmin = !!publicKey && publicKey.toString() === PROTOCOL_ADMIN.toString();
  const canResolve = isCreator || isAdmin;

  useEffect(() => {
    const loadVault = async () => {
      if (!program) return;
      try {
        const [vaultPDA] = findVaultPDA(marketPDA);
        const bal = await program.provider.connection.getBalance(vaultPDA);
        setVaultBal(bal);
      } catch (e) {
        console.error('Failed to load vault balance:', e);
      }
    };
    loadVault();
  }, [program, marketPDA]);

  useEffect(() => {
    const yp = m.yesPool.toNumber();
    const np = m.noPool.toNumber();
    const { yesPrice: yp2, noPrice: np2 } = calculatePrices(yp, np);
    setPriceHistory([{ time: 'Now', yes: yp2, no: np2 }]);
  }, [m.yesPool, m.noPool]);

  const amountLamports = Math.floor(parseFloat(buyAmount || '0') * LAMPORTS_PER_SOL);
  const estShares = amountLamports > 0
    ? estimateShares(m.yesPool.toNumber(), m.noPool.toNumber(), amountLamports, isYes)
    : 0;
  const fee = Math.floor((amountLamports * 200) / 10_000);

  const buyShares = async () => {
    if (!program || !publicKey || amountLamports <= 0) return;
    setLoading(true);
    setStatusMsg(t('trade.buying'));
    try {
      const [vaultPDA] = findVaultPDA(marketPDA);
      const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
      const [positionPDA] = findPositionPDA(marketPDA, publicKey);
      const [treasuryPDA] = findTreasuryPDA();

      await program.methods
        .buyShares(new BN(amountLamports), isYes)
        .accounts({
          market: marketPDA,
          userPosition: positionPDA,
          vault: vaultPDA,
          treasury: treasuryPDA,
          creatorFeeVault: creatorFeeVaultPDA,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatusMsg(t('trade.bought'));
      onRefresh();
      loadPosition();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg(`${t('common.error')}: ${msg}`);
    }
    setLoading(false);
  };

  const resolveMarket = async (outcome: boolean) => {
    if (!program || !publicKey) return;
    setLoading(true);
    setStatusMsg(t('trade.resolving'));
    try {
      const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
      await program.methods
        .resolveMarket(outcome)
        .accounts({
          market: marketPDA,
          creatorFeeVault: creatorFeeVaultPDA,
          creatorWallet: m.creator,
          admin: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setStatusMsg(t('common.success'));
      onRefresh();
      if (program) {
        const updated = await (program.account as any).market.fetch(marketPDA);
        setMarketData(updated);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg(`${t('common.error')}: ${msg}`);
    }
    setLoading(false);
  };

  const claimWinnings = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setStatusMsg(t('trade.claiming'));
    try {
      const [vaultPDA] = findVaultPDA(marketPDA);
      const [positionPDA] = findPositionPDA(marketPDA, publicKey);

      const vaultBalance = await program.provider.connection.getBalance(vaultPDA);
      const rentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(0);
      // The vault retains its rent-exempt seed; only the liquidity above it is distributed.
      const pot = Math.max(vaultBalance - rentExempt, 0);
      const totalShares = m.outcome ? m.totalYesShares.toNumber() : m.totalNoShares.toNumber();
      const userShares = m.outcome ? yesShares : noShares;
      const payout = totalShares > 0 ? Math.floor((pot * userShares) / totalShares) : 0;

      await program.methods
        .claimWinnings()
        .accounts({
          market: marketPDA,
          userPosition: positionPDA,
          vault: vaultPDA,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setClaimAmount(payout);
      setStatusMsg('');
      onRefresh();
      loadPosition();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg(`${t('common.error')}: ${msg}`);
    }
    setLoading(false);
  };

  const yesShares = position?.yesShares?.toNumber() ?? 0;
  const noShares = position?.noShares?.toNumber() ?? 0;
  const hasPosition = yesShares > 0 || noShares > 0;

  const categoryColors: Record<string, string> = {
    crypto: 'bg-orange-500/20 text-orange-300',
    politics: 'bg-blue-500/20 text-blue-300',
    sports: 'bg-green-500/20 text-green-300',
    tech: 'bg-purple-500/20 text-purple-300',
    other: 'bg-gray-500/20 text-gray-300',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('common.back')}
      </button>

      {statusMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
          {statusMsg}
        </div>
      )}
      {(claimAmount !== null || position?.claimed) && ((m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)) && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
          🎉 You won this market!
        </div>
      )}

      {status === 'resolved' && hasPosition && !((m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)) && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm font-semibold bg-red-500/20 border border-red-500/30 text-red-400">
          ❌ You lost this market.
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#141524] border border-white/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${categoryColors[category]}`}>
                {t(`categories.${category}`)}
              </span>
              {status === 'active' && (
                <span className="text-xs text-gray-500">
                  {t('markets.expires')}: {timeUntil(m.endTimestamp.toNumber())}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-white mb-4">{m.question}</h1>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">{yesPrice}¢</div>
                <div className="text-xs text-emerald-400/60 mt-1">{t('markets.yesPrice')} {t('markets.chance')}</div>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{noPrice}¢</div>
                <div className="text-xs text-red-400/60 mt-1">{t('markets.noPrice')} {t('markets.chance')}</div>
              </div>
            </div>

            {status === 'resolved' && (
              <div className={`p-4 rounded-xl text-center font-semibold ${
                m.outcome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {t('markets.outcome')}: {m.outcome ? t('markets.yesWon') : t('markets.noWon')}
              </div>
            )}
            <div className="mt-4 text-xs text-gray-500 space-y-1">
              <div>{t('markets.creator')}: {shortenAddress(m.creator.toString())}
                {publicKey && publicKey.toString() === m.creator.toString() && (
                  <span className="ml-2 text-purple-400 font-medium">👑 You created this market</span>
                )}
              </div>
              <div>{t('markets.endDate')}: {new Date(m.endTimestamp.toNumber() * 1000).toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-[#141524] border border-white/5 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-400 mb-4">{t('trade.priceHistory')}</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory}>
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#666' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#666' }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#1a1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: '#999' }}
                  />
                  <Line type="monotone" dataKey="yes" stroke="#10b981" strokeWidth={2} dot={false} name={t('markets.yesPrice')} />
                  <Line type="monotone" dataKey="no" stroke="#ef4444" strokeWidth={2} dot={false} name={t('markets.noPrice')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {hasPosition && (
          <div className="bg-[#141524] border border-white/5 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-400 mb-4">
              {status === 'resolved' ? t('trade.finalPosition') : t('trade.yourPosition')}
            </h2>
            {status === 'resolved' && (
              <div className={`mb-4 p-3 rounded-lg text-sm font-semibold ${
                (m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {(m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)
                  ? t('trade.winningPosition', { amount: (
                      vaultBal * 
                      (m.outcome ? yesShares : noShares) / 
                      (m.outcome ? m.totalYesShares.toNumber() : m.totalNoShares.toNumber()) / 
                      LAMPORTS_PER_SOL
                    ).toFixed(4) })
                  : t('trade.losingPosition', { amount: (
                      (m.outcome ? noShares : yesShares) / LAMPORTS_PER_SOL
                    ).toFixed(4) })
                }
              </div>
            )}
              <div className="grid grid-cols-2 gap-4">
                {yesShares > 0 && (
                  <div className={`border rounded-lg p-3 ${
                    status === 'resolved'
                      ? m.outcome
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-gray-500/5 border-gray-500/10 opacity-60'
                      : 'bg-emerald-500/5 border-emerald-500/10'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-emerald-400/60">{t('markets.yesPrice')} {t('trade.shares')}</div>
                      {status === 'resolved' && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          m.outcome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {m.outcome ? '✓ Won' : '✗ Lost'}
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-semibold text-emerald-400">{formatSol(yesShares)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('trade.currentValue')}: {(yesShares * (noPrice / 100) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                    </div>
                  </div>
                )}
                {noShares > 0 && (
                  <div className={`border rounded-lg p-3 ${
                    status === 'resolved'
                      ? !m.outcome
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-gray-500/5 border-gray-500/10 opacity-60'
                      : 'bg-red-500/5 border-red-500/10'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-red-400/60">{t('markets.noPrice')} {t('trade.shares')}</div>
                      {status === 'resolved' && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          !m.outcome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {!m.outcome ? '✓ Won' : '✗ Lost'}
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-semibold text-red-400">{formatSol(noShares)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('trade.currentValue')}: {(noShares * (yesPrice / 100) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {status === 'active' && publicKey && (          
            <div className="bg-[#141524] border border-white/5 rounded-xl p-5">
              <h2 className="text-sm font-medium text-white mb-4">{t('trade.buyShares')}</h2>

              <div className="flex mb-3 rounded-lg overflow-hidden border border-white/10">
                <button
                  onClick={() => setIsYes(true)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    isYes
                      ? 'bg-emerald-500 text-white'
                      : 'bg-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {t('markets.yesPrice')} {yesPrice}¢
                </button>
                <button
                  onClick={() => setIsYes(false)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    !isYes
                      ? 'bg-red-500 text-white'
                      : 'bg-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {t('markets.noPrice')} {noPrice}¢
                </button>
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1 block">{t('trade.amountInSol')}</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-2 mb-4 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>{t('trade.estimatedShares')}</span>
                  <span className="text-gray-300">{formatSol(estShares)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('trade.fee')}</span>
                  <span className="text-gray-300">{formatSol(fee)} SOL</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>{t('trade.creatorFee')}</span>
                  <span>{formatSol(Math.floor(fee / 2))} SOL</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>{t('trade.protocolFee')}</span>
                  <span>{formatSol(Math.ceil(fee / 2))} SOL</span>
                </div>
              </div>

              <button
                onClick={buyShares}
                disabled={loading || amountLamports <= 0}
                className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
                  isYes
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? t('trade.buying') : `${t('common.buy')} ${isYes ? t('markets.yesPrice') : t('markets.noPrice')}`}
              </button>
            </div>
          )}

          {(status === 'active' || status === 'expired') && canResolve && (
            <div className="bg-[#141524] border border-white/5 rounded-xl p-5">
              <h2 className="text-sm font-medium text-white mb-3">
                {t('trade.resolve')}
                {isAdmin && !isCreator && (
                  <span className="ml-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                    admin
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => resolveMarket(true)}
                  disabled={loading || status === 'active'}
                  className="flex-1 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                >
                  {t('trade.resolveYes')}
                </button>
                <button
                  onClick={() => resolveMarket(false)}
                  disabled={loading || status === 'active'}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {t('trade.resolveNo')}
                </button>
              </div>
            </div>
          )}

          {status === 'resolved' && publicKey && !position?.claimed && 
            ((m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)) && (            <div className="bg-[#141524] border border-white/5 rounded-xl p-5">
              <button
                onClick={claimWinnings}
                disabled={loading}
                className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                {loading ? t('trade.claiming') : t('trade.claim')}
              </button>
            </div>
          )}

          <div className="bg-[#141524] border border-white/5 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-400 mb-3">{t('markets.totalFee')}</h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                <span className="text-gray-400">{t('markets.creatorFeeNote')}</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span className="text-gray-400">{t('markets.protocolFeeNote')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
