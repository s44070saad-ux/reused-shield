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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
