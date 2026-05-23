import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chronicle — Goku Studio',
  description: "A studio's record of work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
