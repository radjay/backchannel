import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Matrix Archive',
  description: 'Organizations, rooms, and messages',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


