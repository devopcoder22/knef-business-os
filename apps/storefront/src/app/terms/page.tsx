import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions — KNEF Gadgets',
  description: 'Terms and conditions for shopping at KNEF Gadgets',
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms &amp; Conditions</h1>
      <p className="text-gray-500 mb-10">Last updated: October 2026</p>

      <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>
            By placing an order or creating an account on this website, you agree to these terms and
            conditions in full. If you do not agree, please do not use this site.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Products and Pricing</h2>
          <p>
            All prices are displayed in Nigerian Naira (NGN) and are inclusive of applicable taxes unless
            stated otherwise. We reserve the right to change prices at any time. Orders placed before a
            price change will be honoured at the original price.
          </p>
          <p className="mt-2">
            Product images are for illustration purposes. Actual product appearance may vary slightly.
            We make every effort to ensure descriptions are accurate but do not warrant that product
            descriptions are error-free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Orders and Payment</h2>
          <p>
            An order confirmation email does not constitute acceptance of your order. We reserve the
            right to cancel orders due to pricing errors, stock unavailability, or suspected fraud.
            Payment is due before goods are dispatched unless a credit arrangement has been agreed in writing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Delivery</h2>
          <p>
            Delivery timelines are estimates only and are not guaranteed. We are not liable for delays
            caused by third-party couriers, adverse weather, or circumstances beyond our control.
            Risk in goods passes to you upon delivery.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Returns and Refunds</h2>
          <p>
            Please see our{' '}
            <a href="/returns" className="text-blue-600 hover:text-blue-700 font-medium">Returns Policy</a>{' '}
            for full details on returns, exchanges, and refunds.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, KNEF Technology &amp; IT Solutions shall
            not be liable for any indirect, incidental, or consequential loss or damage arising from the
            use of this website or products purchased from it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Governing Law</h2>
          <p>
            These terms are governed by and construed in accordance with the laws of the Federal Republic
            of Nigeria. Any disputes shall be subject to the exclusive jurisdiction of the Nigerian courts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Contact</h2>
          <p>
            Questions about these terms? Email us at{' '}
            <a href="mailto:hello@knefgadgets.com" className="text-blue-600 hover:text-blue-700">
              hello@knefgadgets.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
