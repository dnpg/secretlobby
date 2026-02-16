import type { Route } from "./+types/privacy";

export function meta() {
  return [
    { title: "Privacy Policy - Secret Lobby" },
    { name: "description", content: "Privacy Policy for Secret Lobby - Learn how we collect, use, and protect your personal information." },
  ];
}

export default function Privacy() {
  const lastUpdated = "February 7, 2026";

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="container mx-auto max-w-4xl px-4 py-6">
          <a href="/" className="flex items-center gap-2 w-fit">
            <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-8 h-8" />
            <span className="text-lg font-semibold">Secret Lobby</span>
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">1. Introduction</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Secret Lobby ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              By accessing or using Secret Lobby, you agree to this Privacy Policy. If you do not agree with the terms of this Privacy Policy, please do not access the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">2. Information We Collect</h2>

            <h3 className="text-xl font-medium mb-3 text-white">2.1 Personal Information</h3>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We may collect personal information that you voluntarily provide to us when you:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Register for an account</li>
              <li>Sign up for our waitlist or newsletter</li>
              <li>Upload content to our platform</li>
              <li>Contact us for support</li>
              <li>Participate in surveys or promotions</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              This information may include your name, email address, and any other information you choose to provide.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6 text-white">2.2 Automatically Collected Information</h3>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              When you access our platform, we may automatically collect certain information, including:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>IP address and approximate location</li>
              <li>Browser type and version</li>
              <li>Operating system</li>
              <li>Device information</li>
              <li>Usage data and analytics</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6 text-white">2.3 Audio Content</h3>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              When you upload music or audio content to Secret Lobby, we store this content securely on our servers. We do not claim ownership of your content, and we only use it to provide our services to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">3. How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Provide, operate, and maintain our platform</li>
              <li>Create and manage your account</li>
              <li>Process and fulfill your requests</li>
              <li>Send you updates, newsletters, and marketing communications (with your consent)</li>
              <li>Respond to your comments, questions, and provide customer support</li>
              <li>Monitor and analyze usage trends to improve our services</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">4. Sharing Your Information</h2>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We do not sell, trade, or rent your personal information to third parties. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong>Service Providers:</strong> We may share information with third-party vendors who perform services on our behalf, such as hosting, analytics, and email delivery.</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law, court order, or governmental authority.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.</li>
              <li><strong>With Your Consent:</strong> We may share information with your explicit consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">5. Data Security</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encryption, secure servers, and access controls.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">6. Data Retention</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We retain your personal information for as long as your account is active or as needed to provide you services. We may also retain and use your information as necessary to comply with legal obligations, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">7. Your Rights and Choices</h2>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Depending on your location, you may have certain rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-out:</strong> Opt out of marketing communications at any time</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              To exercise these rights, please contact us at privacy@secretlobby.co.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">8. California Privacy Rights (CCPA)</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA). These include the right to know what personal information we collect, the right to delete your information, and the right to opt out of the sale of your information. We do not sell personal information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">9. Children's Privacy</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Secret Lobby is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">10. International Data Transfers</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. By using our platform, you consent to the transfer of your information to the United States and other countries where we operate.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">11. Cookies and Tracking Technologies</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We use cookies and similar tracking technologies to collect information and improve our services. You can control cookies through your browser settings. For more information, please see our Cookie Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">12. Changes to This Privacy Policy</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">13. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              If you have questions or concerns about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <div className="mt-4 text-gray-300">
              <p>Secret Lobby</p>
              <p>Email: privacy@secretlobby.co</p>
            </div>
          </section>
        </div>

        {/* Back to Home */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <a href="/" className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
            &larr; Back to Home
          </a>
        </div>
      </main>
    </div>
  );
}
