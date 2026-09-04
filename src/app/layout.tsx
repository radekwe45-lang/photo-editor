import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aperture — Realistic Photo Editor",
  description:
    "Desktop-first realistic photo editor with local tools and operator-controlled generative backends.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
