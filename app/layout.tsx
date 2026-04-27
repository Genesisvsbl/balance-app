import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BALANCE",
  description: "Sistema profesional de planeación de materiales",
  icons: {
    icon: "/LOGO.png",
    shortcut: "/LOGO.png",
    apple: "/LOGO.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}