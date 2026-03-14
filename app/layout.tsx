import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Grocery Splitter',
  description: 'Split grocery bills with flatmates',
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
        <meta name="theme-color" content="#f9fafb" />
      </head>
      <body className="bg-gray-50 font-sans">{children}</body>
    </html>
  );
}
