  'use client';

  import { useState, useEffect, useCallback } from 'react';
  import { useTranslations } from 'next-intl';
  import { useVerdict } from '../hooks/useVerdict';
  import Navbar from './Navbar';
  import MarketCard from './MarketCard';
  import MarketDetail from './MarketDetail';
  import CreateMarket from './CreateMarket';
  import Portfolio from './Portfolio';
  import {
    getMarketStatus,
    guessCategory,
    type MarketWithKey,
  } from '../lib/market-utils';
  import type { Category } from '../lib/constants';

  type Tab = 'markets' | 'portfolio' | 'create';
  type StatusFilter = 'all' | 'active' | 'resolved' | 'expired';
  type SortOption = 'newest' | 'endingSoon';

  export default function VerdictApp() {
    const t = useTranslations();
      const { program, readonlyProgram } = useVerdict();

    const [activeTab, setActiveTab] = useState<Tab>('markets');
    const [markets, setMarkets] = useState<MarketWithKey[]>([]);
    const [selectedMarket, setSelectedMarket] = useState<MarketWithKey | null>(null);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('newest');

    const loadMarkets = useCallback(async () => {
      if (!readonlyProgram) return;
      try {
        const allMarkets = await (readonlyProgram.account as any).market.all();
        setMarkets(allMarkets as unknown as MarketWithKey[]);
      } catch (e) {
        console.error('Failed to load markets:', e);
      }
    }, [program]);

    useEffect(() => {
      if (readonlyProgram) loadMarkets();
    }, [readonlyProgram, loadMarkets]);

    const filteredMarkets = markets
      .filter((m) => {
        const q = m.account.question.toLowerCase();
        if (search && !q.includes(search.toLowerCase())) return false;
        if (categoryFilter !== 'all' && guessCategory(m.account.question) !== categoryFilter) return false;
        if (statusFilter !== 'all' && getMarketStatus(m.account) !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return b.account.endTimestamp.toNumber() - a.account.endTimestamp.toNumber();
        if (sortBy === 'endingSoon') return a.account.endTimestamp.toNumber() - b.account.endTimestamp.toNumber();
        return 0;
      });

    const handleMarketClick = (market: MarketWithKey) => {
      setSelectedMarket(market);
    };

    const handleBack = () => {
      setSelectedMarket(null);
      loadMarkets();
    };

    const handleTabChange = (tab: Tab) => {
      setActiveTab(tab);
      setSelectedMarket(null);
    };

    const categoryOptions: (Category | 'all')[] = ['all', 'crypto', 'politics', 'sports', 'tech', 'other'];
    const statusOptions: StatusFilter[] = ['all', 'active', 'resolved', 'expired'];

    return (
      <div className="min-h-screen bg-[#0d0e1a] text-gray-200">
        <Navbar activeTab={activeTab} onTabChange={handleTabChange} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {activeTab === 'markets' && !selectedMarket && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-1">{t('markets.title')}</h1>
                <p className="text-gray-400 text-sm">{t('markets.subtitle')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('markets.searchPlaceholder')}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
                >
                  <option value="newest">{t('markets.sortNewest')}</option>
                  <option value="endingSoon">{t('markets.sortEndingSoon')}</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {t(`markets.${s}`)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {categoryOptions.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      categoryFilter === c
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {t(`categories.${c}`)}
                  </button>
                ))}
              </div>

              {filteredMarkets.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-4xl mb-4">&#9878;&#65039;</div>
                  <p className="text-gray-400">{t('markets.noMarkets')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMarkets.map((market, i) => (
                    <MarketCard
                      key={i}
                      market={market}
                      onClick={() => handleMarketClick(market)}
                    />
                  ))}
                </div>
              )}

              <footer className="mt-16 border-t border-white/5 pt-8 pb-12">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
                  <div className="flex items-center gap-4">
                    <span>{t('footer.poweredBy')}</span>
                    <span>|</span>
                    <span>{t('footer.builtWith')}</span>
                  </div>
                  <span className="text-purple-400/60">{t('footer.creatorRewards')}</span>
                </div>
              </footer>
            </>
          )}

          {activeTab === 'markets' && selectedMarket && (
            <MarketDetail
              market={selectedMarket}
              program={program}
              onBack={handleBack}
              onRefresh={loadMarkets}
            />
          )}

          {activeTab === 'portfolio' && (
            <Portfolio markets={markets} program={program} />
          )}

          {activeTab === 'create' && (
            <CreateMarket
              program={program}
              onCreated={() => {
                loadMarkets();
                setActiveTab('markets');
              }}
            />
          )}
        </main>
      </div>
    );
  }
