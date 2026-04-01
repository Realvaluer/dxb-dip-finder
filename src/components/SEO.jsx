import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'DXB Dip Finder';
const SITE_URL = 'https://www.dxbdipfinder.com';
const DEFAULT_OG = `${SITE_URL}/og-default.jpg`;

export default function SEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG,
  ogType = 'website',
  noindex = false,
  structuredData = null,
  keywords = []
}) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — Find Dubai Property Price Drops`;

  const fullCanonical = canonical
    ? `${SITE_URL}${canonical}`
    : null;

  return (
    <Helmet>
      {/* Core */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}
      <meta
        name="robots"
        content={
          noindex
            ? 'noindex, nofollow'
            : 'index, follow, max-snippet:-1, max-image-preview:large'
        }
      />
      {fullCanonical && (
        <link rel="canonical" href={fullCanonical} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={SITE_NAME} />
      {fullCanonical && (
        <meta property="og:url" content={fullCanonical} />
      )}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}
