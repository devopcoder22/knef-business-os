import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us — KNEF Gadgets',
  description: 'Get in touch with KNEF Technology & IT Solutions',
};

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Us</h1>
      <p className="text-gray-500 mb-10">We&apos;re here to help with your order or any questions.</p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">KNEF Technology & IT Solutions</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Lagos, Nigeria</p>
            <p>
              <span className="font-medium">Phone:</span>{' '}
              <a href="tel:+2348000000000" className="hover:text-blue-600">+234 800 000 0000</a>
            </p>
            <p>
              <span className="font-medium">Email:</span>{' '}
              <a href="mailto:hello@knefgadgets.com" className="hover:text-blue-600">hello@knefgadgets.com</a>
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
