/**
 * Branded email layout (same look as the Supabase auth templates in supabase/templates):
 * table layout and inline styles for email clients, no images. Pure; unit-tested.
 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function emailLayout(opts: {
  title: string;
  preheader: string;
  heading: string;
  /** Trusted HTML paragraphs (escape any user data before passing it in). */
  body: string;
  button: { label: string; href: string };
  /** Trusted HTML under the button. */
  after?: string;
  footer: string;
}): string {
  const { title, preheader, heading, body, button, after = "", footer } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f2;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f2;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td style="background-color:#131416;border-radius:20px 20px 0 0;padding:28px 32px;">
            <span style="font-family:${FONT};font-size:26px;font-weight:700;letter-spacing:-1px;color:#eaebed;">notchlift<span style="color:#c3ed89;">.</span></span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border-radius:0 0 20px 20px;padding:32px;font-family:${FONT};color:#16191b;">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.4px;color:#16191b;">${esc(heading)}</h1>
            ${body}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
              <tr>
                <td align="center" style="border-radius:14px;background-color:#c3ed89;">
                  <a href="${esc(button.href)}" target="_blank" style="display:block;padding:16px 24px;font-size:17px;line-height:22px;font-weight:700;color:#172009;text-decoration:none;border-radius:14px;">${esc(button.label)}</a>
                </td>
              </tr>
            </table>
            ${after}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#8a9095;">
            ${footer}<br><br>
            <a href="https://notchlift.com" target="_blank" style="color:#8a9095;text-decoration:underline;">notchlift.com</a> &middot; Workout planner &amp; tracker
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export const p = (html: string, muted = false) =>
  `<p style="margin:0 0 14px;font-size:16px;line-height:24px;color:${muted ? "#6b7176" : "#4a5055"};">${html}</p>`;
