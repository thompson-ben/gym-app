/** Public site address, for canonical links, sitemaps and social previews. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://setmodo.com").replace(/\/$/, "");

/** Setmodo on the App Store (Apple ID of the app in App Store Connect). */
export const APP_STORE_ID = "6830100182";
export const APP_STORE_URL = `https://apps.apple.com/gb/app/setmodo-workout-tracker/id${APP_STORE_ID}`;
