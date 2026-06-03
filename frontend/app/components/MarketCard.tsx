'use client';

import { useTranslations } from 'next-intl';
import {
  calculatePrices,
  getMarketStatus,
  shortenAddress,
  timeUntil,
  guessCategory,
  type MarketWithKey,
} from '../lib/market-utils';

interface MarketCardProps {
  market: MarketWithKey;
  onClick: () => void;
}

export default function MarketCard({ market, onClick }: MarketCardProps) {
  const t = useTranslations();
  const m = market.account;
  const status = getMarketStatus(m);
  const { yesPrice, noPrice } = calculatePrices(m.yesPool.toNumber(), m.noPool.toNumber());
  const category = guessCategory(m.question);

  const categoryColors: Record<string, string> = {
    crypto: 'bg-orange-500/20 text-orange-300',
    politics: 'bg-blue-500/20 text-blue-300',
    sports: 'bg-green-500/20 text-green-300',
    tech: 'bg-purple-500/20 text-purple-300',
    other: 'bg-gray-500/20 text-gray-300',
  };

  const statusBadge = {
    active: 'bg-emerald-500/20 text-emerald-300',
    expired: 'bg-yellow-500/20 text-yellow-300',
    resolved: 'bg-blue-500/20 text-blue-300',
  };

  return (
    <div
      onClick={onClick}
      className="group bg-[#141524] border border-white/5 rounded-xl p-5 cursor-pointer hover:border-white/15 hover:bg-[#181930] transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${categoryColors[category]}`}>
            {t(`categories.${category}`)}
          </span>
          <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${statusBadge[status]}`}>
            {t(`markets.${status}`)}
          </span>
        </div>
        {status === 'active' && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {timeUntil(m.endTimestamp.toNumber())}
          </span>
        )}
      </div>

      <h3 className="text-white font-medium text-sm leading-snug mb-4 line-clamp-2 group-hover:text-white/90">
        {m.question}
      </h3>

      {status === 'resolved' ? (
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold px-3 py-1 rounded-full ${
              m.outcome ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}
          >
            {m.outcome ? t('markets.yesWon') : t('markets.noWon')}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-2.5 text-center hover:bg-emerald-500/20 transition-colors">
            <div className="text-emerald-400 font-semibold text-lg">{yesPrice}¢</div>
            <div className="text-[10px] text-emerald-400/60 uppercase font-medium">{t('markets.yesPrice')}</div>
          </button>
          <button className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg py-2.5 text-center hover:bg-red-500/20 transition-colors">
            <div className="text-red-400 font-semibold text-lg">{noPrice}¢</div>
            <div className="text-[10px] text-red-400/60 uppercase font-medium">{t('markets.noPrice')}</div>
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
        <span>{t('markets.creator')}: {shortenAddress(m.creator.toString())}</span>
        <span className="text-gray-600">{t('markets.creatorFeeNote')}</span>
      </div>
    </div>
  );
}
