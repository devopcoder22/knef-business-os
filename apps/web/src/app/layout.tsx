import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

const BACKEND = process.env.INTERNAL_API_URL ?? 'http://localhost:4000/api/v1';

async function getBranding() {
  try {
    const res = await fetch(`${BACKEND}/organization/branding`, { next: { revalidate: 300 } });
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
      default: 'KNEF Business OS',
      template: '%s | KNEF Business OS',
    },
    description: 'ERP + AI platform for KNEF Gadgets, Lagos Nigeria',
    robots: { index: false, follow: false },
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
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
