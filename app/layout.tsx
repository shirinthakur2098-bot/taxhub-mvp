import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxHub – Client Intake",
  description: "AI-native client intake and workflow assistant for German tax advisory firms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
