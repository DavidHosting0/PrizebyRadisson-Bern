import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Prize by Radisson Bern · Housekeeping',
  description: 'Hotel housekeeping operations',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/PrizeByRadisson.png', type: 'image/png' }],
    apple: [{ url: '/PrizeByRadisson.png', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Housekeeping' },
};

export const viewport: Viewport = {
  themeColor: '#2B2B2B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
