import { Suspense } from 'react';

export default function ShopifyLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
