import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ToastProvider } from '@/components/ui/toast';
import { AdSenseScript } from '@/components/adsense/AdSenseScript';
import { parseStorefrontSettings } from '@/lib/api';
import type { StorefrontSettings } from '@/lib/api';

const BACKEND = process.env.STOREFRONT_INTERNAL_URL ?? 'http://localhost:4000';
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'KNEF Gadgets';

async function getBranding() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/organization/branding`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

const SETTINGS_BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

/**
 * Load the admin-configured storefront settings on the server so the header and footer render
 * the real contact details in the first HTML, instead of placeholders until the browser fetches them.
 * Returns null on failure so the browser falls back to fetching them itself.
 */
async function getStorefrontSettings(): Promise<StorefrontSettings | null> {
  try {
    const res = await fetch(`${SETTINGS_BACKEND}/api/v1/ecommerce/public/settings`, {
      headers: { 'x-api-key': API_KEY },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ key: string; value: string }> };
    return Array.isArray(json.data) ? parseStorefrontSettings(json.data) : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: {
    default: `${STORE_NAME} — Smartphones & Electronics`,
    template: `%s | ${STORE_NAME}`,
  },
  description:
    'Shop the latest smartphones, gadgets, and consumer electronics at KNEF Gadgets, Lagos Nigeria. Genuine products, competitive prices, fast delivery.',
  openGraph: { type: 'website', siteName: STORE_NAME },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branding, settings] = await Promise.all([getBranding(), getStorefrontSettings()]);
  const faviconHref = branding?.faviconUrl || null;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {faviconHref ? (
          <>
            <link rel="icon" href={faviconHref} />
            <link rel="apple-touch-icon" href={faviconHref} />
          </>
        ) : (
          <>
            <link rel="icon" type="image/x-icon" href="/favicon.ico" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
            <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          </>
        )}
      </head>
      <body className="font-sans antialiased bg-gray-50 min-h-screen flex flex-col">
        <Providers initialSettings={settings}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <ToastProvider />
          <AdSenseScript />
        </Providers>
      </body>
    </html>
  );
}
