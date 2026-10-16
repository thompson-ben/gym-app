import { NextResponse } from "next/server";

// TEMPORARY (preview branch only, never merged): checks whether the server and the browser can
// reach the Supabase address in NEXT_PUBLIC_SUPABASE_URL, and the old default address.
export const dynamic = "force-dynamic";

const OLD = "https://ffrufyxoqjzijzqsbntm.supabase.co";

async function probe(base: string, key: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    return `${res.status} in ${Date.now() - started} ms: ${(await res.text()).slice(0, 120)}`;
  } catch (e) {
    return `FAILED after ${Date.now() - started} ms: ${e instanceof Error ? `${e.name}: ${e.message}${e.cause ? ` (${String((e.cause as Error).message ?? e.cause)})` : ""}` : String(e)}`;
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const [a, b] = await Promise.all([probe(url, key), probe(OLD, key)]);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:15px/1.5 system-ui;padding:16px;background:#131416;color:#eee">
<h3>Supabase connection check</h3>
<p><b>Configured URL:</b> ${esc(url)}<br><b>Key set:</b> ${key ? "yes (" + esc(key.slice(0, 14)) + "…)" : "NO"}</p>
<p><b>Server → configured:</b> ${esc(a)}<br><b>Server → old address:</b> ${esc(b)}</p>
<p><b>Browser → configured (health):</b> <span id="c1">…</span><br><b>Browser → configured (sign-in endpoint):</b> <span id="c2">…</span><br><b>Browser → old address (sign-in endpoint):</b> <span id="c3">…</span></p>
<script>
const key=${JSON.stringify(key)}, url=${JSON.stringify(url.replace(/\/$/, ""))}, old=${JSON.stringify(OLD)};
async function t(id, u, opts){const s=Date.now();try{const r=await fetch(u,opts);document.getElementById(id).textContent=r.status+" in "+(Date.now()-s)+" ms";}catch(e){document.getElementById(id).textContent="FAILED after "+(Date.now()-s)+" ms: "+e;}}
const login={method:"POST",headers:{apikey:key,"content-type":"application/json"},body:JSON.stringify({email:"nobody@example.com",password:"not-a-real-password"})};
t("c1",url+"/auth/v1/health",{headers:{apikey:key}});
t("c2",url+"/auth/v1/token?grant_type=password",login);
t("c3",old+"/auth/v1/token?grant_type=password",login);
</script></body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
