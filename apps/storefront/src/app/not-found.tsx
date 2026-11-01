import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-extrabold text-gray-100 leading-none">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-3">
          Page not found
        </h1>
        <p className="text-gray-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-knef-primary text-white rounded-xl font-medium hover:bg-opacity-90 transition-colors"
          >
            <Home size={16} />
            Go Home
          </Link>
          <Link
            href="/products"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} />
            Browse Products
          </Link>
        </div>
      </div>
    </div>
  );
}
