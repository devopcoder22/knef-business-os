import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ToastProvider } from '@/components/ui/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';

export const metadata: Metadata = {
  title: {
    default: `${STORE_NAME} — Smartphones & Electronics`,
    template: `%s | ${STORE_NAME}`,
  },
  description:
    'Shop the latest smartphones, gadgets, and consumer electronics at KNEF Gadgets, Lagos Nigeria. Genuine products, competitive prices, fast delivery.',
  openGraph: {
    type: 'website',
    siteName: STORE_NAME,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 min-h-screen flex flex-col`}>
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <ToastProvider />
        </Providers>
      </body>
    </html>
  );
}
