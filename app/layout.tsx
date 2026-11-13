import type { ReactNode } from "react";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/config";

export const metadata = {
  title: `${PRODUCT_NAME} — Know your reused-content risk before YouTube does`,
  description:
    "Audit your faceless or automation channel for reused-content / inauthentic-content risk before you apply for monetization. Plus a provenance vault and appeal pack for the 21-day appeal clock.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
