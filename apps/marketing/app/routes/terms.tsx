import type { Route } from "./+types/terms";

export function meta() {
  return [
    { title: "Terms of Service - Secret Lobby" },
    { name: "description", content: "Terms of Service for Secret Lobby - Read our terms and conditions for using our platform." },
  ];
}

export default function Terms() {
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
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">1. Agreement to Terms</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              By accessing or using Secret Lobby ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We reserve the right to modify these Terms at any time. We will notify you of any changes by updating the "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">2. Description of Service</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Secret Lobby is a platform that allows artists and music creators to share their music privately with selected recipients through password-protected "lobbies." The Service provides tools for uploading, organizing, and sharing audio content in a controlled environment.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">3. Account Registration</h2>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              To use certain features of the Service, you must register for an account. When registering, you agree to:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and update your information to keep it accurate</li>
              <li>Maintain the security and confidentiality of your login credentials</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized access or use of your account</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You must be at least 18 years old to create an account. By creating an account, you represent and warrant that you are at least 18 years of age.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">4. User Content</h2>

            <h3 className="text-xl font-medium mb-3 text-white">4.1 Ownership</h3>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You retain all ownership rights to the content you upload to the Service ("User Content"). Secret Lobby does not claim ownership of your User Content.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6 text-white">4.2 License to Secret Lobby</h3>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              By uploading User Content, you grant Secret Lobby a limited, non-exclusive, royalty-free license to store, process, and transmit your content solely for the purpose of providing the Service to you and your authorized recipients.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6 text-white">4.3 Content Responsibility</h3>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You are solely responsible for your User Content. You represent and warrant that:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-4">
              <li>You own or have the necessary rights to upload and share the content</li>
              <li>Your content does not infringe any third-party rights, including copyrights, trademarks, or privacy rights</li>
              <li>Your content does not violate any applicable laws or regulations</li>
              <li>Your content does not contain malware, viruses, or harmful code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">5. Prohibited Uses</h2>
            <p className="text-gray-300 leading-relaxed mb-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Upload content that you do not have the right to share</li>
              <li>Infringe on the intellectual property rights of others</li>
              <li>Upload illegal, harmful, threatening, abusive, or defamatory content</li>
              <li>Distribute malware, viruses, or other harmful software</li>
              <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
              <li>Interfere with or disrupt the Service or its servers</li>
              <li>Use the Service for any illegal purpose</li>
              <li>Circumvent any security measures or access controls</li>
              <li>Scrape, harvest, or collect data from the Service without authorization</li>
            </ul>
          </section>

          <section className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-[#ed1b2f]">6. Content Protection Limitations - Important Disclaimer</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              <strong className="text-white">PLEASE READ THIS SECTION CAREFULLY.</strong>
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              While Secret Lobby implements security measures to protect your content, including password protection, access controls, and encryption, <strong className="text-white">we cannot guarantee absolute protection against all forms of unauthorized copying or distribution.</strong>
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You acknowledge and understand that:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-3 ml-4 mt-4">
              <li><strong className="text-white">External Recording:</strong> Recipients with authorized access to your content may record or capture audio using external devices, screen recording software, or other means outside of our control. We cannot prevent or detect such recordings.</li>
              <li><strong className="text-white">Password Sharing:</strong> If you share lobby passwords with recipients, those recipients may share the passwords with unauthorized third parties. You are responsible for carefully selecting who you share access with.</li>
              <li><strong className="text-white">No Absolute Security:</strong> No digital platform can provide 100% protection against determined bad actors. While we implement industry-standard security measures, technical vulnerabilities may exist.</li>
              <li><strong className="text-white">Human Factor:</strong> Authorized recipients may intentionally or unintentionally share or leak your content. We have no control over the actions of individuals you grant access to.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              <strong className="text-white">By using the Service, you acknowledge that Secret Lobby is not responsible or liable for any unauthorized copying, recording, distribution, or misuse of your content by third parties, including but not limited to recipients who record content using external devices or software.</strong>
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We strongly recommend that you only share sensitive or unreleased content with trusted individuals and record labels with whom you have established professional relationships.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">7. Intellectual Property</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              The Service, including its design, features, and content (excluding User Content), is owned by Secret Lobby and is protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on the Service without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">8. DMCA and Copyright Infringement</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Secret Lobby respects the intellectual property rights of others and expects users to do the same. We will respond to notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA).
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              If you believe your copyrighted work has been infringed on our platform, please send a DMCA notice to dmca@secretlobby.io with the required information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">9. Termination</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Upon termination, your right to use the Service will immediately cease. If you wish to terminate your account, you may do so by contacting us or using the account deletion feature in your account settings.
            </p>
          </section>

          <section className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-white">10. Disclaimer of Warranties</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Secret Lobby does not warrant that:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-4">
              <li>The Service will function uninterrupted, secure, or available at any particular time or location</li>
              <li>Any errors or defects will be corrected</li>
              <li>The Service is free of viruses or other harmful components</li>
              <li>The results of using the Service will meet your requirements</li>
              <li>Your content will be completely protected from unauthorized access or copying</li>
            </ul>
          </section>

          <section className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-white">11. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SECRET LOBBY, ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-4">
              <li>Your access to or use of or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              <li>Unauthorized copying, recording, or distribution of your content by third parties, including through external recording devices or software</li>
              <li>Any leaks or unauthorized sharing of your content by recipients you granted access to</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID US, IF ANY, IN THE PAST TWELVE (12) MONTHS.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">12. Indemnification</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              You agree to defend, indemnify, and hold harmless Secret Lobby and its officers, directors, employees, contractors, agents, licensors, suppliers, successors, and assigns from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">13. Governing Law</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any legal action or proceeding arising out of these Terms shall be brought exclusively in the federal or state courts located in Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">14. Dispute Resolution</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              Any dispute arising from these Terms or the Service shall first be attempted to be resolved through informal negotiation. If the dispute cannot be resolved informally within thirty (30) days, either party may pursue binding arbitration in accordance with the rules of the American Arbitration Association.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">15. Severability</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              If any provision of these Terms is held to be unenforceable or invalid, such provision will be changed and interpreted to accomplish the objectives of such provision to the greatest extent possible under applicable law, and the remaining provisions will continue in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">16. Entire Agreement</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and Secret Lobby regarding the Service and supersede all prior and contemporaneous written or oral agreements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-white">17. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
              If you have any questions about these Terms, please contact us at:
            </p>
            <div className="mt-4 text-gray-300">
              <p>Secret Lobby</p>
              <p>Email: legal@secretlobby.io</p>
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
