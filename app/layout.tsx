import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Camline";
  const description = "A live visual library for Valkyrie Black Eye camera positions across Rainbow Six Siege maps and bomb sites.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: {
      icon: [{ url: "/camline-favicon.png", type: "image/png", sizes: "512x512" }],
      shortcut: "/camline-favicon.png",
      apple: [{ url: "/camline-mark.png", type: "image/png", sizes: "512x512" }],
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: new URL("/og.png", origin).toString(), width: 1731, height: 909, alt: "Camline Valkyrie Camera Atlas" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
