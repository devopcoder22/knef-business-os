import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

const BACKEND = process.env.INTERNAL_API_URL ?? 'http://localhost:4000/api/v1';

async function getBranding() {
  try {
    const res = await fetch(`${BACKEND}/organization/branding`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: {
    default: 'KNEF Business OS',
    template: '%s | KNEF Business OS',
  },
  description: 'ERP + AI platform for KNEF Gadgets, Lagos Nigeria',
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getBranding();
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
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
