'use client';

import { useTranslations } from 'next-intl';

interface ConnectWalletPlaceholderProps {
  emoji: string;
  titleKey: string;
}

export default function ConnectWalletPlaceholder({ emoji, titleKey }: ConnectWalletPlaceholderProps) {
  const t = useTranslations();
  return (
    <div className="text-center py-20">
      <div className="text-4xl mb-4" dangerouslySetInnerHTML={{ __html: emoji }} />
      <h2 className="text-xl font-semibold text-white mb-2">{t(titleKey)}</h2>
      <p className="text-gray-400 text-sm">{t('common.connectWallet')}</p>
    </div>
  );
}
