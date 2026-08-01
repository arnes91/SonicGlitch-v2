import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Glitch Sovereign - WebGL Audio Visualizer',
  description: 'High-octane WebGL audio visualizer & signal analyzer with multi-band FFT, procedural synth engine, mic input & track upload.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050505] text-[#D1D1D1] antialiased selection:bg-[#FF0055] selection:text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
