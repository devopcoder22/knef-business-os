import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — KNEF Gadgets',
  description: 'How KNEF Technology & IT Solutions handles your personal data',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-gray-500 mb-10">Last updated: October 2026</p>

      <div className="prose prose-gray max-w-none space-y-8 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
          <p>
            When you place an order or create an account, we collect your name, email address, phone number,
            and delivery address. We also collect order history and payment method preferences (we do not
            store card details — payments are handled by our banking partners).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To process and fulfil your orders</li>
            <li>To send order confirmations and delivery updates</li>
            <li>To respond to enquiries and provide customer support</li>
            <li>To improve our products and services</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Data Sharing</h2>
          <p>
            We do not sell your personal data. We may share your information with delivery partners solely
            to fulfil your order, and with payment processors to handle transactions. All third parties are
            contractually required to keep your data secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Data Retention</h2>
          <p>
            We retain order records for seven years as required by Nigerian tax law. You may request
            deletion of your account at any time; order records tied to your account will be anonymised
            rather than deleted to preserve transaction integrity.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Security</h2>
          <p>
            Your account password is hashed using industry-standard bcrypt. All data is transmitted over
            HTTPS. Access to customer data is restricted to authorised staff only.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Your Rights</h2>
          <p>
            You have the right to access, correct, or request deletion of your personal data. To exercise
            these rights, contact us at{' '}
            <a href="mailto:hello@knefgadgets.com" className="text-blue-600 hover:text-blue-700">
              hello@knefgadgets.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Contact</h2>
          <p>
            KNEF Technology &amp; IT Solutions, Lagos, Nigeria.{' '}
            <a href="mailto:hello@knefgadgets.com" className="text-blue-600 hover:text-blue-700">
              hello@knefgadgets.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
