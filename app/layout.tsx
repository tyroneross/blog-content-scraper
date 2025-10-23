import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Web Scraper Testing App',
  description: 'Test web scraping with intelligent content filtering',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
