import "server-only";
import { headers } from "next/headers";
import { isNativeAppUserAgent } from "./native";

/** In a server component or route: whether this request comes from the iOS app. */
export async function isNativeRequest(): Promise<boolean> {
  return isNativeAppUserAgent((await headers()).get("user-agent"));
}
