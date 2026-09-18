import { ArrowLeft, GitFork, Mail, ShieldCheck } from "lucide-react";
import { SITE_CONFIG } from "../config/site.js";

const UPDATED_DATE = "18 September 2026";

export function SiteFooter({ className = "" }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer-main">
        <span>
          © 2026 Vansh · Operated by <strong>{SITE_CONFIG.companyName}</strong>
        </span>
        <nav className="site-footer-links" aria-label="Legal and support">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Use</a>
          <a href={`mailto:${SITE_CONFIG.supportEmail}`}>Contact us</a>
        </nav>
      </div>
      <div className="site-footer-meta">
        <span>{SITE_CONFIG.domainLabel}</span>
        <span>{SITE_CONFIG.supportEmail}</span>
      </div>
    </footer>
  );
}

function LegalHeader() {
  return (
    <header className="legal-header">
      <a className="legal-brand" href="/" aria-label="Back to Vansh">
        <span className="brand-mark"><GitFork size={20} /></span>
        <span>
          <strong>Vansh</strong>
          <small>Our roots, connected</small>
        </span>
      </a>
      <a className="legal-back" href="/"><ArrowLeft size={16} /> Back to Vansh</a>
    </header>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <span className="mini-title">LEGAL</span>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: {UPDATED_DATE}</p>
      <p className="legal-draft-note">
        This is a pre-launch draft. The company name, final domain and contact address must be updated before public launch and the policy should be legally reviewed for the jurisdictions in which Vansh operates.
      </p>

      <section>
        <h2>1. Who we are</h2>
        <p>
          Vansh is a private, collaborative family-history and genealogy service operated by <strong>{SITE_CONFIG.companyName}</strong> ("Vansh", "we", "us" or "our"). Our final registered company details and website domain will be added before launch.
        </p>
        <p>
          For privacy or support questions, contact us at <a href={`mailto:${SITE_CONFIG.supportEmail}`}>{SITE_CONFIG.supportEmail}</a>.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>Depending on how you use Vansh, we may process information including:</p>
        <ul>
          <li>account information such as your name, email address and authentication details;</li>
          <li>family-history information such as names, relationships, dates, places, alternate names, family branches and notes;</li>
          <li>information about living or deceased relatives entered by you or another family member;</li>
          <li>family invitations, identity claims, connection requests and collaboration activity;</li>
          <li>changes made to shared family records and related audit information;</li>
          <li>technical information required to operate, secure and diagnose the service.</li>
        </ul>
        <p>We ask users not to add information that is unnecessary for building and maintaining a family history.</p>
      </section>

      <section>
        <h2>3. Where family information comes from</h2>
        <p>
          Family information may be provided directly by the person it describes or by another relative or collaborator. Genealogy records can therefore contain information about people who do not yet have a Vansh account. Users are responsible for entering information responsibly and respecting the privacy of living relatives.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>create and maintain family trees and family-history records;</li>
          <li>allow invited relatives to collaborate on shared family information;</li>
          <li>suggest possible identity or family matches using limited clues where discovery is enabled;</li>
          <li>process profile claims, corrections, invitations and family updates;</li>
          <li>provide search, place, language and other product features;</li>
          <li>secure, troubleshoot and improve Vansh;</li>
          <li>conduct research and, using aggregated, anonymised or de-identified information where appropriate, help develop future products, services, technologies or ventures operated by <strong>{SITE_CONFIG.companyName}</strong>;</li>
          <li>respond to support, privacy and legal requests.</li>
        </ul>
        <p>We do not use family-tree information for unrelated advertising purposes.</p>
      </section>

      <section>
        <h2>5. Research, future products and ventures</h2>
        <p>
          <strong>{SITE_CONFIG.companyName}</strong> may use aggregated, anonymised or de-identified information derived from use of Vansh to conduct research, understand how the service is used, and develop, test or improve Vansh and other future products, services, technologies or ventures operated by the company.
        </p>
        <p>
          Where we wish to use identifiable personal information for a materially different purpose from the purposes described in this Privacy Policy, we will assess whether that use is compatible with the original purpose and, where required by applicable law, provide additional notice or obtain consent before doing so.
        </p>
        <p>
          We do not sell identifiable family-tree information to third parties.
        </p>
      </section>

      <section>
        <h2>6. Visibility and sharing</h2>
        <p>
          Vansh is designed to be private by default. Family records are not intended to be publicly searchable on the open web. Access depends on family connections, invitations, claims and permissions within Vansh.
        </p>
        <p>
          When Vansh detects a possible match, it may show limited matching clues rather than a complete private profile. Full family records are not silently merged merely because a possible match is detected.
        </p>
      </section>

      <section>
        <h2>7. Service providers</h2>
        <p>
          We may use trusted service providers to operate Vansh, such as database, authentication, website-hosting, email-delivery, mapping or language-processing providers. These providers may process information only as necessary to provide their services to us. The final list of material providers will be maintained as the production infrastructure is finalized.
        </p>
      </section>

      <section>
        <h2>8. Account deletion and shared family history</h2>
        <p>
          You can request deletion of your Vansh account. Deleting an account removes that user's login and account access. Because Vansh is collaborative, information that forms part of a shared family-history record may not automatically disappear solely because the person who originally entered it deletes their account.
        </p>
        <p>
          A person may contact us to request access to, correction of, or deletion or restriction of personal information about themselves where applicable. We will assess requests in light of applicable law and the rights and interests of other family members using the shared record.
        </p>
      </section>

      <section>
        <h2>9. Data retention</h2>
        <p>
          We retain account information while an account remains active and for as long as reasonably necessary to operate, secure and comply with legal obligations relating to the service. Shared genealogy information may be retained as part of a family record after a contributor deletes their account, subject to applicable privacy rights and legitimate deletion or correction requests.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use technical and organizational safeguards intended to protect Vansh data, including authenticated access and database access-control rules. No online service can guarantee absolute security, and users should protect their login credentials and notify us of suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2>11. Your choices and rights</h2>
        <p>
          Depending on where you live, you may have rights relating to your personal information, including access, correction, deletion, restriction, objection or portability. You may also have the right to complain to your local data-protection authority.
        </p>
        <p>
          To exercise a privacy right, contact <a href={`mailto:${SITE_CONFIG.supportEmail}`}>{SITE_CONFIG.supportEmail}</a>. We may need to verify your identity before completing a request.
        </p>
      </section>

      <section>
        <h2>12. Children</h2>
        <p>
          Vansh is not intended for children to independently create accounts unless permitted by applicable law and any required parental or guardian authorization. Family trees may contain genealogical information about minors entered by adult relatives; users should add only information appropriate for a private family-history service.
        </p>
      </section>

      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy as Vansh develops. If changes materially affect how personal information is handled, we will provide appropriate notice through the service or other reasonable means.
        </p>
      </section>

      <section className="legal-contact-box">
        <Mail size={20} />
        <div>
          <strong>Privacy or support question?</strong>
          <a href={`mailto:${SITE_CONFIG.supportEmail}`}>{SITE_CONFIG.supportEmail}</a>
        </div>
      </section>
    </>
  );
}

function TermsOfUse() {
  return (
    <>
      <span className="mini-title">LEGAL</span>
      <h1>Terms of Use</h1>
      <p className="legal-updated">Last updated: {UPDATED_DATE}</p>
      <p className="legal-draft-note">
        This is a pre-launch draft. The company name, final domain and contact address must be updated before public launch and the terms should be legally reviewed for the jurisdictions in which Vansh operates.
      </p>

      <section>
        <h2>1. About these terms</h2>
        <p>
          These Terms of Use govern your use of Vansh, a collaborative family-history and genealogy service operated by <strong>{SITE_CONFIG.companyName}</strong> ("Vansh", "we", "us" or "our"). By creating an account or using Vansh, you agree to these Terms.
        </p>
      </section>

      <section>
        <h2>2. What Vansh provides</h2>
        <p>
          Vansh allows users to create family trees, preserve family history, record relationships and places, collaborate with relatives, and use identity or family-matching features. Vansh is a platform for user-contributed family information; it is not an official civil, historical or genealogical authority.
        </p>
      </section>

      <section>
        <h2>3. Your account</h2>
        <p>
          You are responsible for providing accurate account information, protecting your login credentials, and activity carried out through your account. You must not impersonate another person or attempt to gain unauthorized access to another family's information.
        </p>
      </section>

      <section>
        <h2>4. Family information you add</h2>
        <p>
          You may add information about yourself and relatives where you reasonably believe doing so is appropriate and lawful. You should take particular care with information about living people and should not add sensitive, harmful or unnecessary information merely because a field or note can technically be stored.
        </p>
        <p>
          You are responsible for the content you contribute and for respecting the privacy, dignity and rights of other people represented in a family tree.
        </p>
      </section>

      <section>
        <h2>5. Accuracy and disputed information</h2>
        <p>
          Family history can be incomplete, uncertain or disputed. Vansh does not guarantee that a user-created relationship, date, location, name or historical statement is accurate. Users may propose corrections, claim profiles, or resolve duplicate and conflicting records through available Vansh features.
        </p>
      </section>

      <section>
        <h2>6. Collaboration and shared records</h2>
        <p>
          Some family information may be collaboratively maintained. Changes made by one permitted family member may therefore affect records visible to other permitted family members. Deleting an account does not necessarily delete shared genealogy records that remain part of another user's legitimate family history.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not use Vansh to:</p>
        <ul>
          <li>harass, threaten, stalk or doxx another person;</li>
          <li>publish information unlawfully or intentionally violate another person's privacy;</li>
          <li>impersonate another person or submit fraudulent identity claims;</li>
          <li>attempt to bypass access controls or obtain family records you are not authorized to access;</li>
          <li>introduce malicious code, abuse the service, or interfere with its operation;</li>
          <li>use Vansh for unlawful purposes.</li>
        </ul>
      </section>

      <section>
        <h2>8. Your content and permission to operate the service</h2>
        <p>
          You retain any rights you have in content you submit. You grant Vansh the limited permission necessary to host, store, process, reproduce and display that content to you and authorized users for the purpose of operating and improving the Vansh service. This permission ends when the relevant content is deleted, except where retention is reasonably necessary for shared records, backups, security, legal obligations or the rights of other users.
        </p>
      </section>

      <section>
        <h2>9. Suspension and termination</h2>
        <p>
          We may restrict or suspend access where reasonably necessary to protect users, investigate misuse, comply with law, or address serious or repeated violations of these Terms. You may stop using Vansh and request account deletion through the available account controls.
        </p>
      </section>

      <section>
        <h2>10. Availability and changes</h2>
        <p>
          Vansh is evolving and may change over time. We may add, modify or discontinue features, and we do not guarantee uninterrupted or error-free availability. During beta operation, features and data structures may change as we improve the service.
        </p>
      </section>

      <section>
        <h2>11. No professional or historical guarantee</h2>
        <p>
          Vansh is provided as a family-history collaboration tool. Information in Vansh should not be treated as legal, medical, financial, immigration, inheritance or official historical advice or evidence without independent verification.
        </p>
      </section>

      <section>
        <h2>12. Liability</h2>
        <p>
          To the extent permitted by applicable law, Vansh is provided on an "as available" basis. Nothing in these Terms excludes or limits rights or liabilities that cannot legally be excluded. Final liability, governing-law and dispute provisions will be completed when the operating company and launch jurisdiction are finalized.
        </p>
      </section>

      <section>
        <h2>13. Changes to these terms</h2>
        <p>
          We may update these Terms as Vansh develops. Material changes will be communicated through the service or other reasonable means. Continued use after an updated version becomes effective constitutes acceptance where permitted by law.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these Terms can be sent to <a href={`mailto:${SITE_CONFIG.supportEmail}`}>{SITE_CONFIG.supportEmail}</a>.
        </p>
      </section>

      <section className="legal-contact-box">
        <ShieldCheck size={20} />
        <div>
          <strong>Questions about these terms?</strong>
          <a href={`mailto:${SITE_CONFIG.supportEmail}`}>{SITE_CONFIG.supportEmail}</a>
        </div>
      </section>
    </>
  );
}

export function LegalPage({ type }) {
  return (
    <div className="legal-shell">
      <LegalHeader />
      <main className="legal-page">
        <article className="legal-card">
          {type === "terms" ? <TermsOfUse /> : <PrivacyPolicy />}
        </article>
      </main>
      <SiteFooter className="legal-footer" />
    </div>
  );
}
