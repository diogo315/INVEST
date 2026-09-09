import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Fuentes servidas desde el propio repo (variable, subset latin).
// Antes esto era `next/font/google`, que descarga las tipografías en tiempo
// de BUILD: en una red con proxy corporativo Node no lo atraviesa y el build
// se cae con "Failed to fetch `Inter` from Google Fonts". Con next/font/local
// el build no necesita internet.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  title: "TradingView Gratis — Crypto charts open source",
  description:
    "Plataforma de charts crypto en vivo. Alternativa gratis a TradingView. Powered by Binance + lightweight-charts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-tv-bg text-tv-text">
        {/* React 19 sube estos <link> al <head>. Abren la conexión TLS a los
            hosts de datos mientras todavía carga el JS, así el primer fetch
            de velas no paga el handshake completo. */}
        <link rel="preconnect" href="https://api.binance.com" />
        <link rel="preconnect" href="https://api.bitget.com" />
        <link rel="preconnect" href="https://fapi.binance.com" />
        <link rel="dns-prefetch" href="https://stream.binance.com" />
        <link rel="dns-prefetch" href="https://fstream.binance.com" />
        <link rel="dns-prefetch" href="https://ws.bitget.com" />
        <TooltipProvider delay={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
