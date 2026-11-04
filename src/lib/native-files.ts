/**
 * Saving or sharing a file from the site. Browsers download it (or use the Web Share sheet);
 * the iOS app's web view can do neither, so there the file is written to the app's cache and
 * handed to iOS's share sheet (Save to Files, AirDrop, Messages, Instagram…).
 */

/** "attachment; filename="setmodo-2026-10-30.csv"" → "setmodo-2026-10-30.csv" (pure, unit-tested). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const name = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const clean = name ? decodeURIComponent(name).replace(/[/\\]/g, "-").trim() : "";
  return clean || fallback;
}

async function toBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** iOS's share sheet reports closing it as an error; that's not one. */
export const isShareCancel = (e: unknown) => /cancel/i.test(e instanceof Error ? e.message : String(e ?? ""));

/** Shares a file through the iOS app's share sheet. Resolves false if the person closes it. */
export async function shareFileNatively(blob: Blob, filename: string, title?: string): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri] });
    return true;
  } catch (e) {
    if (isShareCancel(e)) return false;
    throw e;
  }
}

/** In the iOS app: fetch a download link's file and open the share sheet with it. */
export async function shareDownload(href: string, fallbackName: string): Promise<boolean> {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const blob = await res.blob();
  return shareFileNatively(blob, filenameFromDisposition(res.headers.get("content-disposition"), fallbackName));
}
