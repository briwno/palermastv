import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PalermasTV",
  description: "O futebol é a desculpa. A casa dos Palermas.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
