import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import '@/styles/globals.css';

// Self-hosted by next/font at build time; no runtime request to Google.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const manrope = localFont({
  src: '../../public/fonts/manrope-variable.ttf',
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DIY Instax Photobooth',
  description: 'DIY Instax photobooth for souvenirs.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
