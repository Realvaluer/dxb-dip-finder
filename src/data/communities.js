// Community slug mapping for SEO community pages.
// `name` must match the exact community string from the database.
// Add new communities here as coverage expands.

const communities = [
  {
    slug: 'jvc',
    name: 'Jumeirah Village Circle',
    shortName: 'JVC',
    description: 'Track property price drops in Jumeirah Village Circle (JVC). Browse below-market apartments, townhouses and villas updated daily.',
    keywords: ['JVC property price drop', 'Jumeirah Village Circle deals', 'JVC below market value', 'JVC property for sale'],
  },
  {
    slug: 'business-bay',
    name: 'Business Bay',
    description: 'Find property price reductions in Business Bay. Monitor apartments and offices with price drops updated daily.',
    keywords: ['Business Bay property price drop', 'Business Bay deals', 'Business Bay below market value'],
  },
  {
    slug: 'dubai-marina',
    name: 'Dubai Marina',
    description: 'Track property price drops in Dubai Marina. Find below-market apartments and penthouses updated daily.',
    keywords: ['Dubai Marina property price drop', 'Dubai Marina deals', 'Dubai Marina below market value'],
  },
  {
    slug: 'downtown-dubai',
    name: 'Downtown Dubai',
    description: 'Find property price reductions in Downtown Dubai. Browse apartments near Burj Khalifa with price drops updated daily.',
    keywords: ['Downtown Dubai property price drop', 'Downtown Dubai deals', 'Downtown Dubai below market value'],
  },
  {
    slug: 'jumeirah-lake-towers',
    name: 'Jumeirah Lake Towers',
    shortName: 'JLT',
    description: 'Track property price drops in Jumeirah Lake Towers (JLT). Find below-market apartments and offices updated daily.',
    keywords: ['JLT property price drop', 'Jumeirah Lake Towers deals', 'JLT below market value'],
  },
  {
    slug: 'palm-jumeirah',
    name: 'Palm Jumeirah',
    description: 'Find property price reductions on Palm Jumeirah. Browse villas and apartments with price drops updated daily.',
    keywords: ['Palm Jumeirah property price drop', 'Palm Jumeirah deals', 'Palm Jumeirah below market value'],
  },
  {
    slug: 'dubai-hills-estate',
    name: 'Dubai Hills Estate',
    description: 'Track property price drops in Dubai Hills Estate. Find below-market villas and apartments updated daily.',
    keywords: ['Dubai Hills Estate property price drop', 'Dubai Hills deals', 'Dubai Hills below market value'],
  },
  {
    slug: 'arabian-ranches',
    name: 'Arabian Ranches',
    description: 'Find property price reductions in Arabian Ranches. Browse villas and townhouses with price drops updated daily.',
    keywords: ['Arabian Ranches property price drop', 'Arabian Ranches deals', 'Arabian Ranches below market value'],
  },
  {
    slug: 'dubai-sports-city',
    name: 'Dubai Sports City',
    description: 'Track property price drops in Dubai Sports City. Find below-market apartments and villas updated daily.',
    keywords: ['Dubai Sports City property price drop', 'Sports City deals', 'Dubai Sports City below market value'],
  },
  {
    slug: 'al-furjan',
    name: 'Al Furjan',
    description: 'Find property price reductions in Al Furjan. Browse townhouses and villas with price drops updated daily.',
    keywords: ['Al Furjan property price drop', 'Al Furjan deals', 'Al Furjan below market value'],
  },
  {
    slug: 'jumeirah-village-triangle',
    name: 'Jumeirah Village Triangle',
    shortName: 'JVT',
    description: 'Track property price drops in Jumeirah Village Triangle (JVT). Find below-market properties updated daily.',
    keywords: ['JVT property price drop', 'Jumeirah Village Triangle deals', 'JVT below market value'],
  },
  {
    slug: 'dubai-south',
    name: 'Dubai South',
    description: 'Find property price reductions in Dubai South. Browse apartments and townhouses with price drops updated daily.',
    keywords: ['Dubai South property price drop', 'Dubai South deals', 'Dubai South below market value'],
  },
  {
    slug: 'damac-hills',
    name: 'DAMAC Hills',
    description: 'Track property price drops in DAMAC Hills. Find below-market villas and townhouses updated daily.',
    keywords: ['DAMAC Hills property price drop', 'DAMAC Hills deals', 'DAMAC Hills below market value'],
  },
  {
    slug: 'town-square',
    name: 'Town Square',
    description: 'Find property price reductions in Town Square Dubai. Browse apartments and townhouses with price drops updated daily.',
    keywords: ['Town Square property price drop', 'Town Square Dubai deals', 'Town Square below market value'],
  },
  {
    slug: 'meydan',
    name: 'Meydan',
    description: 'Track property price drops in Meydan. Find below-market apartments and villas updated daily.',
    keywords: ['Meydan property price drop', 'Meydan deals', 'Meydan below market value'],
  },
  {
    slug: 'international-city',
    name: 'International City',
    description: 'Find property price reductions in International City. Browse affordable apartments with price drops updated daily.',
    keywords: ['International City property price drop', 'International City deals', 'International City below market value'],
  },
  {
    slug: 'dubai-land',
    name: 'Dubai Land',
    description: 'Track property price drops in Dubai Land. Find below-market properties updated daily.',
    keywords: ['Dubai Land property price drop', 'Dubailand deals', 'Dubai Land below market value'],
  },
  {
    slug: 'al-barsha',
    name: 'Al Barsha',
    description: 'Find property price reductions in Al Barsha. Browse villas and apartments with price drops updated daily.',
    keywords: ['Al Barsha property price drop', 'Al Barsha deals', 'Al Barsha below market value'],
  },
  {
    slug: 'motor-city',
    name: 'Motor City',
    description: 'Track property price drops in Motor City. Find below-market apartments and townhouses updated daily.',
    keywords: ['Motor City property price drop', 'Motor City deals', 'Motor City below market value'],
  },
  {
    slug: 'production-city',
    name: 'Production City',
    description: 'Find property price reductions in Production City (IMPZ). Browse apartments with price drops updated daily.',
    keywords: ['Production City property price drop', 'IMPZ deals', 'Production City below market value'],
  },
];

export const communityBySlug = Object.fromEntries(communities.map(c => [c.slug, c]));
export const communityByName = Object.fromEntries(communities.map(c => [c.name, c]));
export default communities;
