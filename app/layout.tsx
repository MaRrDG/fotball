import type { Metadata } from "next";
import { Anton, Archivo } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WC26 Office Predictor",
  description: "World Cup 2026 office prediction game",
};

const TICKER = [
  "Predictions lock 30 minutes before kick-off",
  "Nobody sees your picks until the whistle is near",
  "Exact score +5",
  "Goal difference +3",
  "Right winner +2",
  "Penalty call +2",
  "Champion call +50",
  "Winner takes 60% and the trophy",
  "Last place brings the donuts",
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes into <body> before React hydrates, which is harmless. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Nav />
        {/* broadcast ticker */}
        <div className="overflow-hidden border-b border-line bg-pitch-2/80">
          <div className="ticker-track py-1.5">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                {TICKER.map((t) => (
                  <span key={t} className="tag flex items-center whitespace-nowrap px-6">
                    <span className="mr-6 text-volt">◆</span>
                    {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-line py-5 text-center">
          <span className="tag">
            WC26 office league · settled by the database, not by arguments
          </span>
        </footer>
      </body>
    </html>
  );
}
