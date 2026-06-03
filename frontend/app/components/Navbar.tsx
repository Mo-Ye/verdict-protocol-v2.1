'use client';

import { useTranslations } from 'next-intl';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import LanguageSwitcher from './LanguageSwitcher';

interface NavbarProps {
  activeTab: 'markets' | 'portfolio' | 'create';
  onTabChange: (tab: 'markets' | 'portfolio' | 'create') => void;
}

export default function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const t = useTranslations();

  return (
    <nav className="sticky top-0 z-40 bg-[#0d0e1a]/90 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <button onClick={() => onTabChange('markets')} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                V
              </div>
              <span className="font-semibold text-white hidden sm:block">{t('common.appName')}</span>
            </button>

            <div className="hidden md:flex items-center gap-1">
              {(['markets', 'portfolio', 'create'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t(`nav.${tab}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <WalletMultiButton />
          </div>
        </div>

        <div className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
          {(['markets', 'portfolio', 'create'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t(`nav.${tab}`)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
