import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { ChromeProvider } from '@/lib/chrome-context';
import { Cabecalho } from '@/components/cabecalho';
import { FabIniciarPelada } from '@/components/fab-iniciar-pelada';
import './globals.css';

export const metadata: Metadata = {
  title: 'PeladaFC',
  description: 'Encontre uma comunidade de futebol para jogar perto de você.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="bg-bg text-text font-sans antialiased">
        <AuthProvider>
          <ChromeProvider>
            <Cabecalho />
            {children}
            <FabIniciarPelada />
          </ChromeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
