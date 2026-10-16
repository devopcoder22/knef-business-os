import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ToastProvider } from '@/components/ui/toast';

const BACKEND = process.env.STOREFRONT_INTERNAL_URL ?? 'http://localhost:4000';
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';

async function getBranding() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/organization/branding`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
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
    icons: {
      icon: branding?.faviconUrl || '/favicon.ico',
      shortcut: branding?.faviconUrl || '/favicon-32x32.png',
      apple: branding?.faviconUrl || '/apple-touch-icon.png',
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-gray-50 min-h-screen flex flex-col">
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
