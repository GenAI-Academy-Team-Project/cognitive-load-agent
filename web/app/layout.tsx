import type { Metadata } from 'next';
import { DM_Sans, Outfit } from 'next/font/google';
import './globals.css';

const body = DM_Sans({ variable: '--font-body', subsets: ['latin'] });
const heading = Outfit({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  icons: { apple: '/carestead-icon-192.png' },
  metadataBase: new URL('https://carestead.frincy-clement.chatgpt.site'),
  title: 'Carestead | Care coordination',
  description: 'A caregiver coordination workspace that detects risks, organizes responsibilities, and keeps every decision accountable.',
  openGraph: {
    title: 'Carestead',
    description: 'Care coordination that catches what slips through',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Carestead caregiver coordination' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Carestead',
    description: 'Care coordination that catches what slips through',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${body.variable} ${heading.variable} antialiased`}>{children}</body></html>;
}
