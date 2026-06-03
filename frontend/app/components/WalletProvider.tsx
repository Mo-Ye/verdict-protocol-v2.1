'use client';

import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';
// require('@solana/wallet-adapter-react-ui/styles.css'); zamenio ispod sa ovim     

interface Props {
  children: ReactNode;
}

const WalletContextProvider: FC<Props> = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;
//  const endpoint = useMemo(() => 'http://127.0.0.1:8899', []);
const endpoint = useMemo(() => 'https://api.devnet.solana.com', []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletContextProvider;