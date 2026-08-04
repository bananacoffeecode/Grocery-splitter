import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tally',
  description: 'Snap your receipts and split the bill in seconds',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#f2f1f7" />
      </head>
      <body>{children}</body>
    </html>
  );
}
