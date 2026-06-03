'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { Program } from '@coral-xyz/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  calculatePrices,
  formatSol,
  type MarketWithKey,
  type UserPositionAccount,
} from '../lib/market-utils';
import { findPositionPDA, findVaultPDA } from '../lib/pda';
import { PublicKey } from '@solana/web3.js';

interface PortfolioProps {
  markets: MarketWithKey[];
  program: Program | null;
}

interface PositionWithMarket {
  market: MarketWithKey;
  position: UserPositionAccount;
}

export default function Portfolio({ markets, program }: PortfolioProps) {
  const t = useTranslations();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<PositionWithMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [vaultBalances, setVaultBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadPositions() {
      if (!program || !publicKey || markets.length === 0) return;
      setLoading(true);
      const results: PositionWithMarket[] = [];
      for (const market of markets) {
        try {
          const marketPDA = new PublicKey(market.publicKey.toString());
          const [positionPDA] = findPositionPDA(marketPDA, publicKey);
          const pos = await (program.account as any).userPosition.fetch(positionPDA);
          const position = pos as unknown as UserPositionAccount;
          if (position.yesShares.toNumber() > 0 || position.noShares.toNumber() > 0) {
            results.push({ market, position });
            const [vaultPDA] = findVaultPDA(marketPDA);
            const bal = await program.provider.connection.getBalance(vaultPDA);
            setVaultBalances(prev => ({ ...prev, [market.publicKey.toString()]: bal }));
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('Account does not exist') && !msg.includes('Could not find')) {
            console.error(`Failed to load position for market ${market.publicKey.toString()}:`, e);
          }
        }
      }
      setPositions(results);
      setLoading(false);
    }
    loadPositions();
  }, [program, publicKey, markets]);

  if (!publicKey) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">&#128188;</div>
        <h2 className="text-xl font-semibold text-white mb-2">{t('portfolio.title')}</h2>
        <p className="text-gray-400 text-sm">{t('common.connectWallet')}</p>
      </div>
    );
  }

  const totalValue = positions.reduce((acc, { market, position }) => {
    const m = market.account;
    const yp = m.yesPool.toNumber();
    const np = m.noPool.toNumber();
    const total = yp + np;
    if (total === 0) return acc;
    const yesVal = (position.yesShares.toNumber() * (np / total)) / LAMPORTS_PER_SOL;
    const noVal = (position.noShares.toNumber() * (yp / total)) / LAMPORTS_PER_SOL;
    return acc + yesVal + noVal;
  }, 0);

  const chartData = [{ time: 'Now', value: parseFloat(totalValue.toFixed(4)) }];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">{t('portfolio.title')}</h1>

      <div className="bg-[#141524] border border-white/5 rounded-xl p-6 mb-6">
        <div className="text-sm text-gray-400 mb-1">{t('portfolio.totalValue')}</div>
        <div className="text-3xl font-bold text-white">{totalValue.toFixed(4)} SOL</div>
      </div>

      <div className="bg-[#141524] border border-white/5 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">{t('portfolio.valueOverTime')}</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#666' }} />
              <YAxis tick={{ fontSize: 11, fill: '#666' }} />
              <Tooltip
                contentStyle={{ background: '#1a1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#141524] border border-white/5 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">{t('portfolio.positions')}</h2>

        {loading && <p className="text-gray-500 text-sm">{t('common.loading')}</p>}

        {!loading && positions.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">{t('portfolio.noPositions')}</p>
        )}

        {positions.map(({ market, position }, i) => {
          const m = market.account;
          const { yesPrice, noPrice } = calculatePrices(m.yesPool.toNumber(), m.noPool.toNumber());
          const yesShares = position.yesShares.toNumber();
          const noShares = position.noShares.toNumber();
          const yesVal = (yesShares * (noPrice / 100)) / LAMPORTS_PER_SOL;
          const noVal = (noShares * (yesPrice / 100)) / LAMPORTS_PER_SOL;
          const vaultBal = vaultBalances[market.publicKey.toString()] ?? 0;
          const totalWinShares = m.outcome ? m.totalYesShares.toNumber() : m.totalNoShares.toNumber();
          const userWinShares = m.outcome ? yesShares : noShares;
          const estimatedPayout = totalWinShares > 0 
            ? (vaultBal * userWinShares) / totalWinShares / LAMPORTS_PER_SOL 
            : 0;


          return (
            <div
              key={i}
              className="border-b border-white/5 last:border-0 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-white line-clamp-1">{m.question}</div>
                {m.resolved && (
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                      (m.outcome && yesShares > 0) || (!m.outcome && noShares > 0)
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {(m.outcome && yesShares > 0) || (!m.outcome && noShares > 0) ? '✓ Won' : '✗ Lost'}
                    </span>
                    {estimatedPayout > 0 && (
                      <span className="text-emerald-400 text-xs">+{estimatedPayout.toFixed(4)} SOL</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-4 text-xs">
                {yesShares > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-400">{t('markets.yesPrice')}</span>
                    <span className="text-gray-400">{formatSol(yesShares)} {t('trade.shares')}</span>
                    <span className="text-gray-500">({yesVal.toFixed(4)} SOL)</span>
                  </div>
                )}
                {noShares > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-red-400">{t('markets.noPrice')}</span>
                    <span className="text-gray-400">{formatSol(noShares)} {t('trade.shares')}</span>
                    <span className="text-gray-500">({noVal.toFixed(4)} SOL)</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
