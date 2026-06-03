import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import WalletContextProvider from './components/WalletProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verdict Protocol',
  description: 'Decentralized prediction markets on Solana',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <WalletContextProvider>
            {children}
          </WalletContextProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
