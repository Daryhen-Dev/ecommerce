import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pesca Artesanal Galápagos",
  description:
    "Pescado fresco de Galápagos, con retiro en los aeropuertos de Quito, Guayaquil y Cuenca.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex w-full max-w-4xl items-center px-6 py-4">
            <Link
              href="/"
              className="font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Pesca Artesanal Galápagos
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-neutral-200 bg-white">
          <div className="mx-auto w-full max-w-4xl px-6 py-4 text-sm text-neutral-600">
            Pescado artesanal de la cooperativa · Galápagos, Ecuador
          </div>
        </footer>
      </body>
    </html>
  );
}
