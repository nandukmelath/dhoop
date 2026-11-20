import type { Metadata, Viewport } from 'next';
import { Anek_Devanagari, Anek_Kannada, Anek_Latin, Anek_Malayalam, Anek_Tamil, Anek_Telugu } from 'next/font/google';
import './globals.css';

// Anek is one type family drawn for India's scripts together, so Hindi, Kannada and Malayalam
// sit beside English as equals and not as fallbacks. The Latin cut also comes in a narrow width,
// which the headlines use.
const latin = Anek_Latin({ subsets: ['latin'], axes: ['wdth'], variable: '--font-latin', display: 'swap' });
const deva = Anek_Devanagari({ subsets: ['devanagari'], variable: '--font-deva', display: 'swap', preload: false });
const knda = Anek_Kannada({ subsets: ['kannada'], variable: '--font-knda', display: 'swap', preload: false });
const mlym = Anek_Malayalam({ subsets: ['malayalam'], variable: '--font-mlym', display: 'swap', preload: false });
const taml = Anek_Tamil({ subsets: ['tamil'], variable: '--font-taml', display: 'swap', preload: false });
const telu = Anek_Telugu({ subsets: ['telugu'], variable: '--font-telu', display: 'swap', preload: false });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5eedd',
};

export const metadata: Metadata = {
  title: 'Dhoop: solar for your roof, in your language',
  description:
    'A voice guide that reads your electricity bill, surveys your roof by camera, sizes a solar system, works out the government subsidy and gets installer quotes. Built on Agora Conversational AI and Murf Falcon.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
    other: [
      {
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${latin.variable} ${deva.variable} ${knda.variable} ${mlym.variable} ${taml.variable} ${telu.variable}`}>
      <body className="h-full min-h-screen">{children}</body>
    </html>
  );
}
