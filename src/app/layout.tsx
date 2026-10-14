import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import '@/styles/globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'DIY Instax Photobooth',
  description: 'DIY Instax photobooth for souvenirs.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className={dmSans.variable}>{children}</body>
    </html>
  );
}
