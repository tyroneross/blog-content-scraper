'use client';

import { ScraperTester } from '@/components/ScraperTester';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Web Scraper Testing App
          </h1>
          <p className="text-lg text-gray-600">
            Test web scraping with intelligent content filtering
          </p>
        </div>

        <ScraperTester />

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>Built with Mozilla Readability • No LLM required</p>
        </footer>
      </div>
    </main>
  );
}
