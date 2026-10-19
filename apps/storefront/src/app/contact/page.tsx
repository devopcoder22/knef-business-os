import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us — KNEF Gadgets',
  description: 'Get in touch with KNEF Technology & IT Solutions',
};

const BACKEND = process.env.STOREFRONT_INTERNAL_URL ?? 'http://localhost:4000';

async function getStorefrontSettings() {
  try {
    const res = await fetch(`${BACKEND}/api/storefront-settings`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const json = await res.json();
    const items: { key: string; value: string }[] = json.data ?? [];
    return Object.fromEntries(items.map((i) => [i.key.replace('storefront.', ''), i.value]));
  } catch {
    return {};
  }
}

export default async function ContactPage() {
  const settings = await getStorefrontSettings();

  const address = settings.footerAddress || 'Lagos, Nigeria';
  const phone = settings.footerPhone || '+234 800 000 0000';
  const email = settings.footerEmail || 'info@knefgadgets.com';

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Us</h1>
      <p className="text-gray-500 mb-10">We&apos;re here to help with your order or any questions.</p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">KNEF Technology &amp; IT Solutions</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>{address}</p>
            <p>
              <span className="font-medium">Phone:</span>{' '}
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-blue-600">{phone}</a>
            </p>
            <p>
              <span className="font-medium">Email:</span>{' '}
              <a href={`mailto:${email}`} className="hover:text-blue-600">{email}</a>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Business Hours</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Monday – Friday</span><span>9:00 AM – 6:00 PM</span>
            </div>
            <div className="flex justify-between">
              <span>Saturday</span><span>10:00 AM – 4:00 PM</span>
            </div>
            <div className="flex justify-between">
              <span>Sunday</span><span>Closed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Order Support</h2>
        <p className="text-sm text-gray-600">
          For order enquiries, please have your order reference number ready. You can also{' '}
          <a href="/order" className="text-blue-600 hover:text-blue-700 font-medium">track your order online</a>.
        </p>
      </div>
    </div>
  );
}
