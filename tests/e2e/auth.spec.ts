import { expect, test } from "@playwright/test";
import { emailCount, emailLink, newUser, seedSplit, signIn, uniqueEmail } from "./helpers";

test("sign-up requires email confirmation and continues to the original destination", async ({ page, browser }) => {
  const owner = await newUser("confirm-owner");
  const { splitId } = await seedSplit(owner, "Shared PPL", "Push", ["dip"], false);
  const { data: share } = await owner.client
    .rpc("upsert_split_share", { p_split_id: splitId, p_name: "Shared PPL", p_description: null, p_include_notes: false })
    .throwOnError();

  const email = uniqueEmail("signup");
  await page.goto(`/s/${share.token}`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Unconfirmed accounts cannot sign in yet.
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Please confirm your email first")).toBeVisible();

  const link = await emailLink(email, /Confirm your Splitmate account/);
  expect(link).toContain("/auth/confirm?token_hash=");
  await page.goto(link);
  await page.waitForURL(`**/s/${share.token}`);
  await expect(page.getByRole("button", { name: "Copy split" })).toBeVisible();

  // The same link opened on another device (fresh browser) also confirms, then cannot be reused.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await otherPage.waitForURL("**/sign-in?error=confirm_failed");
  await expect(otherPage.getByText("That confirmation link is invalid or has expired")).toBeVisible();
  await other.close();
});

test("password reset: neutral request, email link, new password, invalid and reused links", async ({ page }) => {
  const user = await newUser("reset");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL("**/forgot-password?email=*");
  await expect(page.getByLabel("Email")).toHaveValue(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  const neutral = page.getByText(`If an account exists for ${user.email}, we have sent a link`);
  await expect(neutral).toBeVisible();

  // An unknown address gets exactly the same response, and no email is sent.
  const nobody = uniqueEmail("nobody");
  await page.getByRole("button", { name: "Send another link" }).click();
  await page.getByLabel("Email").fill(nobody);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(`If an account exists for ${nobody}, we have sent a link`)).toBeVisible();

  const link = await emailLink(user.email, /Reset your Splitmate password/);
  expect(link).toContain("/auth/reset?token_hash=");
  expect(await emailCount(nobody)).toBe(0);

  await page.context().clearCookies();
  await page.goto(link);
  await page.waitForURL("**/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("new-horse-battery");
  await page.getByLabel("Confirm new password").fill("different-horse");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
  await page.getByLabel("Confirm new password").fill("new-horse-battery");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL("**/train");

  // Old password no longer works; the new one does.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await signIn(page, { ...user, password: "new-horse-battery" });

  // A used link, a forged link and Supabase's own expiry redirect all ask for a new link.
  await page.context().clearCookies();
  for (const bad of [link, "/auth/reset?token_hash=forged-token-hash", "/auth/reset?error=access_denied&error_code=otp_expired"]) {
    await page.goto(bad);
    await page.waitForURL("**/forgot-password?error=link_invalid");
    await expect(page.getByText("That reset link is invalid or has expired.")).toBeVisible();
  }
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Reset link expired" })).toBeVisible();
});

test("cross-account privacy in the app: another account's pages are not found", async ({ page }) => {
  const owner = await newUser("private-owner");
  const { splitId, templateId } = await seedSplit(owner, "Private split", "Push", ["dip"]);
  const doc = await owner.client.rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId }).throwOnError();

  const intruder = await newUser("private-intruder");
  await signIn(page, intruder);
  for (const path of [`/splits/${splitId}`, `/splits/${splitId}/workouts/${templateId}`, `/workout/${doc.data.id}`, `/sessions/${doc.data.id}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(page.getByText("Private split")).toHaveCount(0);
  }
  await page.goto("/splits");
  await expect(page.getByText("Private split")).toHaveCount(0);
});

test("signing out with unsynced workout data warns first and then clears it from the device", async ({ page }) => {
  const user = await newUser("signout");
  await seedSplit(user, "Sign-out split", "Push", ["dip"]);
  await signIn(page, user);
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  // The sync endpoint becomes unreachable, so the next set exists only on this device.
  await page.route("**/rest/v1/rpc/sync_session", (route) => route.abort("internetdisconnected"));
  const row = page.getByRole("group", { name: "Dip, set 1" });
  await row.getByLabel(/reps$/).fill("10");
  await row.getByRole("button", { name: /Confirm Dip, set 1/ }).click();
  await expect(page.getByText("Offline · on this device")).toBeVisible({ timeout: 10_000 });

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Unsynced workout data" })).toBeVisible();
  await page.getByRole("button", { name: "Stay signed in" }).click();
  expect(await page.evaluate((id) => Object.keys(localStorage).filter((k) => k.includes(id)).length, user.id)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out anyway" }).click();
  await page.waitForURL("**/sign-in");
  const leftovers = await page.evaluate((id) => Object.keys(localStorage).filter((k) => k.includes(id)), user.id);
  expect(leftovers).toEqual([]);
});

test("the app is installable: manifest, icons and an active service worker", async ({ page }) => {
  await page.goto("/sign-in");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await page.context().newCDPSession(page);
  await page.reload();
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  // Playwright contexts are incognito profiles, which Chrome never offers to install; every
  // app-side criterion (manifest, icons, service worker, HTTPS/localhost) must pass.
  expect(installabilityErrors.filter((e) => e.errorId !== "in-incognito")).toEqual([]);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Splitmate: Workout Planner & Tracker", display: "standalone", start_url: "/train" });
});
