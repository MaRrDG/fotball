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
  title: "Salut un pariu",
  description: "da frt",
};

const TICKER = [
  "Ce citesti aici?",
  "Hai romania!",
  "Omul este o persoana umana",
  "1-1 pauza, 2-0 final",
  "Acum e timpul sa iti faci cont pe superbet.",
  "Ai n-ai mingea tragi la poarta!",
  "Acum, ce sa va zic, dupa acest rezultat, calificarea este si posibila, si imposibila",
  "Vasi decar.",
  "Hai Otelul!",
  "O bere ciucas va rog",
  "M-am certat si cu Mitica Dragomir, dar fara jigniri. El m-a facut oligofren, eu l-am facut zdreanta, dar nu ne-am insultat.",
  "Apa bei, apa joci.",
  "In est nu e ca in vest frt",
  "Trei puncteee",
  "Taca taca la tocanaaa",
  "Am avut si noroc si sansa.",
  "Daca marcam un gol la inceput, pe urma putem sa jucam si la 0-0.",
  "Becali e un brand. Eu la Avicola Iasi pot sa fac pui Gigi Becali, daca vreau.",
  "Miauuuu miaaaaaaauuuu miaaaaaaaau",
  "Aducetineeeee echipeeee, ca nu avem cu cine sa jucam",
  "Repetitie repetitie, repetitie repetitie....",
  "Cele 3 M-uri: Munca, Mentalitate si Ambitie",
  "Ai n-ai mingea, tragi la poarta",
  "Este un meci de care pe care, dar nu este decisiv.",
  "Noi facem bine ca sa facem rau"
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
