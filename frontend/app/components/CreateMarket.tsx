'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { CATEGORIES, type Category } from '../lib/constants';
import { findMarketPDA, findVaultPDA, findCreatorFeeVaultPDA } from '../lib/pda';
import { extractErrorMessage } from '../lib/market-utils';
import StatusBanner from './ui/StatusBanner';
import ConnectWalletPlaceholder from './ui/ConnectWalletPlaceholder';

interface CreateMarketProps {
  program: Program | null;
  onCreated: () => void;
}

export default function CreateMarket({ program, onCreated }: CreateMarketProps) {
  const t = useTranslations();
  const { publicKey } = useWallet();

  const [question, setQuestion] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState<Category>('crypto');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleCreate = async () => {
    if (!program || !publicKey || !question || !endDate) return;
    setLoading(true);
    setStatusMsg(t('create.creating'));
    try {
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
      const [marketPDA] = findMarketPDA(publicKey, question);
      const [vaultPDA] = findVaultPDA(marketPDA);
      const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);

      // The program auto-funds the vault and creator-fee vault with the rent-exempt
      // minimum inside create_market, so no client-side pre-funding is needed.
      await program.methods
        .createMarket(question, new BN(endTimestamp))
        .accounts({
          market: marketPDA,
          vault: vaultPDA,
          creatorFeeVault: creatorFeeVaultPDA,
          creator: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatusMsg(t('create.created'));
      setQuestion('');
      setEndDate('');
      onCreated();
    } catch (e: unknown) {
      setStatusMsg(`${t('common.error')}: ${extractErrorMessage(e)}`);
    }
    setLoading(false);
  };

  if (!publicKey) {
    return (
      <div className="max-w-lg mx-auto">
        <ConnectWalletPlaceholder emoji="&#9878;&#65039;" titleKey="create.title" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">{t('create.title')}</h1>

      <StatusBanner message={statusMsg} />

      <div className="bg-[#141524] border border-white/5 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">{t('create.questionLabel')}</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('create.questionPlaceholder')}
            maxLength={200}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
          />
          <div className="text-right text-xs text-gray-600 mt-1">{question.length}/200</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">{t('create.categoryLabel')}</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  category === cat
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                {t(`categories.${cat}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">{t('create.endDateLabel')}</label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-purple-300 font-medium">{t('create.feeInfo')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('create.rulesText')}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !question || !endDate}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('create.creating') : t('create.submit')}
        </button>
      </div>
    </div>
  );
}
