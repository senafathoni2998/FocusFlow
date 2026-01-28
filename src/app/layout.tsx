import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "FocusFlow - Productivity Dashboard",
  description: "Manage tasks, track focus sessions, and boost productivity",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
