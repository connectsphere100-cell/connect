import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'ZenStack360 Connect', description: 'One workspace for every customer conversation.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
