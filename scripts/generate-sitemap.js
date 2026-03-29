import { SitemapStream, streamToPromise } from 'sitemap';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

const SITE_URL = 'https://dxbdipfinder.com';

// Phase 1: only the pages that exist right now
// Phase 2 will add /area/:slug/ community pages
const links = [
  {
    url: '/',
    changefreq: 'daily',
    priority: 1.0,
    lastmod: new Date().toISOString()
  }
];

async function generate() {
  const stream = new SitemapStream({ hostname: SITE_URL });
  const data = await streamToPromise(Readable.from(links).pipe(stream));
  createWriteStream('public/sitemap.xml').write(data);
  console.log('sitemap.xml generated successfully');
}

generate().catch(err => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
