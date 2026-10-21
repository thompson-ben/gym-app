import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal/LegalPage";
import { CookieChoiceButton } from "@/components/ConsentBanner";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        NotchLift is a workout planner and tracker. This page explains, in plain English, what we store, why, and what you can do about it. There
        are no ads in NotchLift and we never sell data.
      </p>
      <section>
        <h2>Who we are</h2>
        <p>
          NotchLift is run by {COMPANY.name}, registered in {COMPANY.registeredIn} (company no. {COMPANY.number}), {COMPANY.office}. We are
          the data controller for the information described here.
        </p>
      </section>
      <section>
        <h2>What we store</h2>
        <ul>
          <li>
            <strong>Account:</strong> your email address and password (stored only as a secure hash by our authentication provider). If you
            continue with Apple or Google instead, we receive your email address (with Apple, it can be a private relay address that forwards
            to you) and, if shared, your name, which starts as your display name. We never see your Apple or Google password.
          </li>
          <li><strong>Profile:</strong> an optional display name and app preferences such as default rest time.</li>
          <li><strong>Training data:</strong> the splits, workouts, exercises, sets, notes and dates you enter.</li>
          <li><strong>Membership:</strong> whether you are a founding member, on a trial or subscribed, your plan, renewal date and payments (amounts and dates). If you haven’t logged a workout by the morning after signing up, we send one email to help you get started. If you tell us which days you usually train, we keep those days and, until your first workout, send a short reminder on those mornings (at most four). If a week passes without a workout, our founder sends one email asking what got in the way. Near the end of a free trial we send one reminder email, and if a trial ends without a plan, one email asking why. You can turn these reminder emails off in Profile or with the unsubscribe link in any of them.</li>
          <li>
            <strong>Your answers to our short questions</strong> (each asked once, and you can skip it): how you heard about NotchLift, how
            your trial is going, why you didn’t choose a plan, and the reason you give Stripe if you cancel. We use them, together with where
            you came from, to improve NotchLift and our advertising, and we may email you to follow up on something you wrote.
          </li>
          <li>
            <strong>Visits to our public pages</strong> (not the app itself): the page, the site that linked to it, campaign tags in the link (for
            example from an ad), your device type and country, whether the pricing section or sign-up form was opened, whether the “Try a workout” demo was opened, how far it got (a set, three sets, finished) or create account tapped from it, which buttons were tapped and how far down the page you scrolled, whether you started filling in the sign-up form (never what you typed), your cookie-banner choice, whether someone tapped to create an account (and, if it didn’t go through, a short reason such as “password too short”, never what was typed), and whether the page was open inside the Facebook or Instagram app. No IP address and no ID for you are stored. If you came from a campaign or another
            site, a small cookie remembers where from (not who you are) for up to 30 days. If you then create an account, that source is attached to
            your account so we can see which campaigns bring people who keep training, and the cookie is deleted. Browsers that send Global
            Privacy Control or Do Not Track are not counted.
          </li>
          <li>
            <strong>Support messages and feedback:</strong> what you send us from Help &amp; support or Send feedback, with our replies, the
            screen you were last on, the app version and your device type. We email you when we reply to a support message.
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
          <li><strong>Apple</strong> and <strong>Google</strong> confirm who you are if you choose to sign in with them; they learn that you use NotchLift.</li>
          <li><strong>Resend</strong> sends our emails (confirming your address, resetting your password, reminders and support replies).</li>
          <li><strong>Sentry</strong> receives the technical error reports described above, stored in the EU.</li>
          <li><strong>Meta</strong> (Facebook and Instagram) receives the ad-measurement events described under Cookies, only if you accept them.</li>
          <li><strong>Stripe</strong> processes payments for memberships. Your card details go to Stripe directly and never reach us; we keep only whether you are a member, your plan and renewal date, and amounts paid.</li>
        </ul>
        <p>Except for Meta (see Cookies), these providers process data on our behalf and do not use it for their own purposes.</p>
      </section>
      <section id="cookies" className="scroll-mt-6">
        <h2>Cookies and ad measurement</h2>
        <p>
          We advertise on Instagram and Facebook. If you click <strong>Accept</strong> on the cookie banner, our website loads the Meta Pixel,
          which sets Meta cookies and tells Meta when you visit our public pages (home, the demo workout, sign-in, privacy and terms), create an account or start
          a paid membership (with the plan price). Meta uses this to show us which ads work and may use it under its own privacy policy. Nothing
          about your training is ever sent, and the Pixel does not run inside the app’s screens.
        </p>
        <p>
          If you choose <strong>No thanks</strong>, or your browser sends Global Privacy Control or Do Not Track, the Pixel never loads. Your choice
          is stored in your browser for six months. <CookieChoiceButton />.
        </p>
        <p>
          Other cookies we use are essential: keeping you signed in, your time zone, and the campaign cookie described above (which holds no
          personal data).
        </p>
      </section>
      <section>
        <h2>Sharing</h2>
        <p>
          Your data is private to your account. If you create a share link for a split, the link shows only that split’s structure and targets,
          never your weights, reps or history. You can revoke a link at any time. In a group workout, the people in the group see the plan, the
          name you choose to show them and whether you have started or finished; never your weights, reps or history.
        </p>
        <p>
          Invites: if you join through someone’s invite link, group workout or shared split, we record that they invited you, so they can get
          the invite reward. They see only how many people they invited have signed up and started training, never who, and never anything
          you log.
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
