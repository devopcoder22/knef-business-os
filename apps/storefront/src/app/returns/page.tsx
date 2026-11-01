import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Returns & Refunds — KNEF Gadgets',
  description: 'KNEF Gadgets return policy, exchanges, and refund process',
};

export default function ReturnsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Returns &amp; Refunds</h1>
      <p className="text-gray-500 mb-10">Last updated: October 2026</p>

      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <p className="text-sm font-semibold text-blue-800 mb-1">Quick Summary</p>
          <p className="text-sm text-blue-700">
            We accept returns within <strong>7 days</strong> of delivery for items in their original
            condition and packaging. Dead-on-arrival (DOA) devices are replaced within <strong>48 hours</strong>.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-sm text-gray-700">
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Eligible Returns</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Item received is defective or damaged</li>
              <li>Item does not match the description on the website</li>
              <li>Wrong item delivered</li>
              <li>Item is dead on arrival (DOA)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Non-Returnable Items</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Items showing physical damage caused after delivery</li>
              <li>Items returned without original packaging and accessories</li>
              <li>Consumables (screen protectors, cables) once opened</li>
              <li>Items returned after the 7-day window</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">How to Initiate a Return</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Contact us at <a href="mailto:hello@knefgadgets.com" className="text-blue-600 hover:text-blue-700">hello@knefgadgets.com</a> with your order reference</li>
              <li>Describe the issue and attach photos of the item and packaging</li>
              <li>Our team will respond within 1 business day with next steps</li>
              <li>Ship the item to our Lagos address (return shipping is covered for DOA/wrong items)</li>
            </ol>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Refunds</h2>
            <p>
              Approved refunds are processed within <strong>5–7 business days</strong> to the original
              payment method. For bank transfer payments, we will contact you for your account details.
              Delivery fees are non-refundable unless the return is due to our error.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Exchanges</h2>
            <p>
              We offer like-for-like exchanges for DOA or incorrect items. Subject to stock availability.
              If an exact replacement is unavailable, we will offer a full refund.
            </p>
          </section>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Still have questions?</h2>
          <p className="text-sm text-gray-600">
            Contact our support team at{' '}
            <a href="mailto:hello@knefgadgets.com" className="text-blue-600 hover:text-blue-700 font-medium">
              hello@knefgadgets.com
            </a>{' '}
            or visit our{' '}
            <a href="/contact" className="text-blue-600 hover:text-blue-700 font-medium">Contact page</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
