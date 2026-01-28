import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "FocusFlow - Productivity Dashboard",
  description: "Manage tasks, track focus sessions, and boost productivity",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="antialiased">
        {session?.user && <Navigation userEmail={session.user.email} />}
        {children}
      </body>
    </html>
  );
}
