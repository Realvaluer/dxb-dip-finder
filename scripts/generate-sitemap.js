import { SitemapStream, streamToPromise } from 'sitemap';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

const SITE_URL = 'https://www.dxbdipfinder.com';

// Community slugs — keep in sync with src/data/communities.js
const communitySlugs = [
  'jvc', 'business-bay', 'dubai-marina', 'downtown-dubai',
  'jumeirah-lake-towers', 'palm-jumeirah', 'dubai-hills-estate',
  'arabian-ranches', 'dubai-sports-city', 'al-furjan',
  'jumeirah-village-triangle', 'dubai-south', 'damac-hills',
  'town-square', 'meydan', 'international-city', 'dubai-land',
  'al-barsha', 'motor-city', 'production-city',
];

const links = [
  {
    url: '/',
    changefreq: 'daily',
    priority: 1.0,
    lastmod: new Date().toISOString()
  },
  ...communitySlugs.map(slug => ({
    url: `/area/${slug}/`,
    changefreq: 'daily',
    priority: 0.8,
    lastmod: new Date().toISOString()
  })),
];

async function generate() {
  const stream = new SitemapStream({ hostname: SITE_URL });
  const data = await streamToPromise(Readable.from(links).pipe(stream));
  createWriteStream('public/sitemap.xml').write(data);
  console.log(`sitemap.xml generated successfully (${links.length} URLs)`);
}

generate().catch(err => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
