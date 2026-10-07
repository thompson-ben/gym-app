import type { Metadata } from "next";
import { PaymentConfirmation } from "@/components/billing/PaymentConfirmation";

export const metadata: Metadata = { title: "Welcome" };

export default function UpgradeSuccessPage() {
  return <PaymentConfirmation />;
}
