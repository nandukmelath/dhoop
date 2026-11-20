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

/** Where this copy of Dhoop lives, so that a shared link shows its picture from the right address. */
function siteUrl(): URL {
  for (const address of [process.env.PUBLIC_BASE_URL, process.env.RENDER_EXTERNAL_URL]) {
    try {
      if (address) return new URL(address);
    } catch {}
  }
  return new URL('https://dhoop.onrender.com');
}

const TITLE = 'Dhoop: solar for your roof, in your language';
const ABOUT =
  'A voice guide that finds your roof from space, reads your electricity bill, sizes a solar system, works out the government subsidy and finds registered installers near you, in six Indian languages. Built on Agora Conversational AI and Murf Falcon.';
// The picture a chat or a social post shows beside the link. `npm run brand` makes it.
const CARD = { url: '/brand/dhoop-social-1200x630.png', width: 1200, height: 630, alt: 'Dhoop: solar for your roof, in your language' };

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: ABOUT,
  applicationName: 'Dhoop',
  manifest: '/site.webmanifest',
  openGraph: { title: TITLE, description: ABOUT, url: '/', siteName: 'Dhoop', type: 'website', locale: 'en_IN', images: [CARD] },
  twitter: { card: 'summary_large_image', title: TITLE, description: ABOUT, images: [CARD] },
  icons: {
    icon: [
      { url: '/brand/dhoop-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '48x48' },
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
