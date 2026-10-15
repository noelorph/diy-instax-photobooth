import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'DIY Instax Photobooth',
  description: 'DIY Instax photobooth for souvenirs.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
