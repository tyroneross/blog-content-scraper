# Web Scraper Testing App

Standalone web application for testing web scraping with intelligent content filtering. Built with Next.js, Mozilla Readability, and zero LLM dependencies.

## Features

- ✅ **No configuration needed** - Works immediately
- 🎯 **3-tier filtering** - URL patterns → content validation → quality scoring
- ⚡ **Fast** - Mozilla Readability (92.2% F1 score)
- 📊 **Detailed stats** - See filtering pipeline in action
- 🎨 **Clean UI** - Built with Tailwind CSS
- 🚀 **Deploy anywhere** - Vercel, Netlify, Docker, etc.

## Quick Start

### Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Run dev server:**
```bash
npm run dev
```

3. **Open browser:**
```
http://localhost:3000
```

## Deployment

### Vercel (Recommended)

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Deploy:**
```bash
vercel
```

3. **Production deploy:**
```bash
vercel --prod
```

### Netlify

1. **Build command:**
```
npm run build
```

2. **Publish directory:**
```
.next
```

3. **Deploy:**
```bash
netlify deploy --prod
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t scraper-app .
docker run -p 3000:3000 scraper-app
```

## How It Works

### 3-Tier Filtering System

**Tier 1: URL Deny Patterns**
- Blocks /, /about, /careers, /contact, /tag/*, etc.
- Fast, pattern-based filtering

**Tier 2: Content Validation**
- Minimum 200 characters
- Title length 10-200 characters
- Text-to-HTML ratio ≥ 10%

**Tier 3: Metadata Scoring**
- Content quality: 60% weight
- Publication date: 12% weight
- Author/byline: 8% weight
- Schema.org metadata: 8% weight
- Reading time (2+ min): 12% weight
- **Default threshold**: 50%

### Technology Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Mozilla Readability** - Content extraction
- **JSDOM** - HTML parsing
- **Zod** - Schema validation
- **Lucide React** - Icons

## Project Structure

```
scraper-app/
├── app/
│   ├── api/scraper-test/      # API route
│   │   └── route.ts
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Homepage
│   └── globals.css             # Global styles
├── components/
│   ├── ScraperTester.tsx       # Main UI component
│   └── ScraperResults.tsx      # Results display
├── lib/
│   ├── types.ts                # TypeScript types
│   ├── quality-scorer.ts       # Quality scoring logic
│   └── content-extractor.ts    # Content extraction
├── public/                     # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Environment Variables

No environment variables required! The app works out of the box.

## Performance

- **Single article:** ~2-5 seconds
- **Bundle size:** ~150 KB (gzipped)
- **Zero API costs:** No external APIs used
- **Memory:** ~100 MB average

## Testing

### F1 Score Validation

The **92.2% F1 score** claim for Mozilla Readability is validated through automated testing:

```bash
npm run test:f1
```

This test suite:
- ✅ Compares extracted content against manually-labeled ground truth
- ✅ Calculates precision, recall, and F1 scores
- ✅ Validates extraction quality across diverse article types
- ✅ Current test dataset achieves **96.3% F1 score**

**What is F1 Score?**
- **Precision**: % of extracted content that is actually article content (not ads/navigation)
- **Recall**: % of actual article content that was successfully extracted
- **F1 Score**: Harmonic mean of precision and recall

See [tests/README.md](./tests/README.md) for detailed testing documentation and how to add new test cases.

## License

MIT

## Contributing

Contributions welcome! Areas for improvement:
- RSS/Sitemap discovery
- Batch URL processing
- Export functionality (CSV, JSON)
- Custom quality scoring
- Dark mode

## Support

- Issues: https://github.com/tyroneross/scraper-app/issues
- Questions: Open a discussion

---

**Built with ❤️ using Mozilla Readability**
