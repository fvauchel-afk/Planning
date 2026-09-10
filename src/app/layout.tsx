import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { ClientFrame } from "@/components/ClientFrame";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Planning — Ferronnerie Vauchel",
  description: "Planning d'équipe : administratif, fabrication, logistique et pose.",
  applicationName: "Planning Vauchel",
  appleWebApp: {
    capable: true,
    title: "Planning Vauchel",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b45309",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${serif.variable} ${sans.variable} font-sans antialiased`}>
        <ClientFrame>{children}</ClientFrame>
      </body>
    </html>
  );
}
