import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>NotchLift is provided by {COMPANY.name} (“we”, “us”), registered in {COMPANY.registeredIn}, company no. {COMPANY.number}.</p>
      <p>By creating an account you agree to these terms. They are written to be readable; please contact {contactLine()} if anything is unclear.</p>
      <section>
        <h2>Membership and payment</h2>
        <p>
          New accounts start with a 14-day free trial; no card is needed. After the trial, a membership costs £3.99 a month or £30 a year, including VAT.
          Without one, everything you have logged stays available to view and export, and starting new workouts is paused. Founding members and
          people given free access use NotchLift free of charge.
        </p>
        <p>
          Payments are handled by Stripe; we never see or store your card details. Subscriptions renew automatically at the end of each month or
          year until you cancel. You can cancel at any time from Profile (Manage subscription); you keep access until the end of the period you
          have paid for, and you will not be charged again. If we ever change the price, we will tell you by email before it applies to you.
        </p>
        <p>
          Your right to cancel: you can cancel within 14 days of first subscribing and receive a full refund by contacting us. Deleting your
          account cancels your subscription immediately. Nothing in these terms affects your statutory rights.
        </p>
      </section>
      <section>
        <h2>Not medical advice</h2>
        <p>
          NotchLift records what you do and can suggest targets based on your own logs. It does not know your health, injuries or circumstances.
          Suggestions are optional and are not medical, physiotherapy or coaching advice. Train within your limits and speak to a qualified
          professional if you are unsure whether an exercise or load is right for you.
        </p>
      </section>
      <section>
        <h2>Your account and content</h2>
        <ul>
          <li>Keep your sign-in details to yourself; you are responsible for activity on your account.</li>
          <li>Your training data belongs to you. You can export it or delete your account at any time from Profile.</li>
          <li>Do not misuse the service, for example by trying to access other people’s data or disrupting the app.</li>
          <li>Split names and notes you put in a share link are visible to anyone with that link.</li>
        </ul>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          We work to keep NotchLift available and your data safe, but the service is provided as it is, without guarantees that it will always be
          available or error-free. Export your data if you want your own copy. If we ever close the service, we will give reasonable notice so
          you can export it first.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          Nothing in these terms limits liability that cannot be limited by law. Otherwise we are not liable for indirect losses or for injury
          arising from how you choose to train.
        </p>
      </section>
      <section>
        <h2>Changes and law</h2>
        <p>
          We may update these terms and will show the date of the latest version above; significant changes will be highlighted in the app.
          These terms are governed by the law of England and Wales.
        </p>
      </section>
    </LegalPage>
  );
}
