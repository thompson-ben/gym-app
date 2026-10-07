import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        NotchLift is a workout planner and tracker. This page explains, in plain English, what we store, why, and what you can do about it. We
        do not show ads, sell data or track you across other sites.
      </p>
      <section>
        <h2>What we store</h2>
        <ul>
          <li><strong>Account:</strong> your email address and password (stored only as a secure hash by our authentication provider).</li>
          <li><strong>Profile:</strong> an optional display name and app preferences such as default rest time.</li>
          <li><strong>Training data:</strong> the splits, workouts, exercises, sets, notes and dates you enter.</li>
          <li><strong>Membership:</strong> whether you are a founding member, on a trial or subscribed.</li>
          <li>
            <strong>Visits to our public pages</strong> (not the app itself): the page, the site that linked to it, campaign tags in the link (for
            example from an ad), your device type and country. No IP address and no ID for you are stored. If you came from a campaign or another
            site, a small cookie remembers where from (not who you are) for up to 30 days. If you then create an account, that source is attached to
            your account so we can see which campaigns bring people who keep training, and the cookie is deleted. Browsers that send Global
            Privacy Control or Do Not Track are not counted.
          </li>
          <li>
            <strong>Errors:</strong> technical reports when something breaks (the error, the page and the browser). They never include your email,
            account, IP address or training data, and secret links (such as invite links) are blanked out.
          </li>
          <li>
            <strong>On your device:</strong> a workout in progress is kept in your browser’s storage so a set is never lost to a bad connection, plus
            cookies that keep you signed in and remember your time zone. Signing out removes the stored workout data from that device.
          </li>
        </ul>
      </section>
      <section>
        <h2>Why</h2>
        <p>
          Only to provide NotchLift to you: to sign you in, save and sync your workouts, and show your history and progress. Training logs can be
          considered health-related information; you choose what to record, and it is used for nothing else.
        </p>
      </section>
      <section>
        <h2>Who stores it</h2>
        <ul>
          <li><strong>Supabase</strong> hosts the database and sign-in, in the EU (Ireland).</li>
          <li><strong>Vercel</strong> hosts the app; requests are handled in the EU (Dublin).</li>
          <li><strong>Resend</strong> sends account emails (confirming your address and resetting your password).</li>
          <li><strong>Sentry</strong> receives the technical error reports described above, stored in the EU.</li>
        </ul>
        <p>These providers process data on our behalf and do not use it for their own purposes.</p>
      </section>
      <section>
        <h2>Sharing</h2>
        <p>
          Your data is private to your account. If you create a share link for a split, the link shows only that split’s structure and targets,
          never your weights, reps or history. You can revoke a link at any time. In a group workout, the people in the group see the plan, the
          name you choose to show them and whether you have started or finished; never your weights, reps or history.
        </p>
      </section>
      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><strong>Download your data</strong> at any time: Profile → Your data → Export (spreadsheet or full JSON).</li>
          <li><strong>Correct it</strong> by editing workouts, splits and your profile in the app.</li>
          <li>
            <strong>Delete your account</strong>: Profile → Your data → Delete account. Everything is removed from the live database immediately.
            Copies in provider backups, if any, expire on their normal schedule.
          </li>
          <li>
            You can also contact {contactLine()} with any privacy question. In the UK you have the right to complain to the Information
            Commissioner’s Office (ico.org.uk).
          </li>
        </ul>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>For as long as you have an account. When you delete your account, your data is deleted with it.</p>
      </section>
    </LegalPage>
  );
}
