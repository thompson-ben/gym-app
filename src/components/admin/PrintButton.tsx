"use client";

/**
 * Opens the browser's print sheet, where "Save as PDF" turns the dashboard into one shareable file
 * (on iPhone: Share → Print, then Share again from the preview). The print styles in globals.css
 * switch to light colours and leave out navigation, forms and email addresses.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 shrink-0 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3 print:hidden"
    >
      Save as PDF
    </button>
  );
}
