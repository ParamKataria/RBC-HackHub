import type { Metadata } from "next";
import { Cormorant_Garamond, Fraunces, Geist, Libre_Franklin } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Black Cultural Centre for Nova Scotia: Digital Archive",
  description:
    "Interactive digital archive of the Black Cultural Centre for Nova Scotia, Cherry Brook (established 1983). Explore African Nova Scotian records held across Nova Scotia Archives, Library and Archives Canada, the Black Loyalist Heritage Centre, and the Centre's collections.",
};

const geistSans = Geist({
  variable: "--font-bccns-sans",
  display: "swap",
  subsets: ["latin"],
});

const cormorantSerif = Cormorant_Garamond({
  variable: "--font-bccns-serif",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  subsets: ["latin"],
});

/**
 * SOURCE OF TRUTH KEYWORDS: Fraunces, Libre Franklin, arrival display, arrival sans
 * WHAT: Type pairing used only on the arrival and ask covers.
 * WHY: The rotunda keeps Cormorant and Geist. The cover needed a different voice without a new palette.
 * WHERE: html class on the root layout, consumed by .bccns-arrival-screen.
 */
const arrivalDisplay = Fraunces({
  variable: "--font-bccns-display",
  style: ["normal", "italic"],
  display: "swap",
  subsets: ["latin"],
});

const arrivalSans = Libre_Franklin({
  variable: "--font-bccns-arrival",
  weight: ["400", "500", "600"],
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${cormorantSerif.variable} ${arrivalDisplay.variable} ${arrivalSans.variable}`}
      suppressHydrationWarning
    >
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
