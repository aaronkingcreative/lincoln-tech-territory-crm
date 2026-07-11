export type TerritoryReviewCounty = {
  county: string;
  why: string;
  status: 'included' | 'review';
  knownExpectedHighSchools: number | null;
  note: string;
};

export const TERRITORY_REVIEW_COUNTIES: TerritoryReviewCounty[] = [
  { county: 'Ada', why: 'Boise is inside the approved Lincoln Tech recruiting boundary, so Ada County is now part of the active baseline.', status: 'included', knownExpectedHighSchools: 31, note: 'Included now; seeded from public high school, charter, alternative, private, and CTE/career rows with official/authoritative source links for verification.' },
  { county: 'Owyhee', why: 'Confirmed addition adjacent to Canyon and Ada counties with high-school-level recruiting targets in Marsing, Homedale, and Bruneau-Grand View.', status: 'included', knownExpectedHighSchools: 3, note: 'Included now; seed rows add only Marsing High School, Homedale High School, and Rimrock Jr/Sr High School. Elementary-only Owyhee County districts remain context only, and Owyhee High School in Meridian remains Ada County / West Ada.' },
  { county: 'Oneida', why: 'Southeast Idaho county near existing Bannock/Power corridor.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Franklin', why: 'Southeast Idaho county near the Cache Valley edge of the possible route.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Bear Lake', why: 'Southeast Idaho county east of the current approved Bannock/Caribou review corridor.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Caribou', why: 'Southeast Idaho county between existing Bannock/Power coverage and Bear Lake review area.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Blaine', why: 'Central Idaho county near the edge between Magic Valley and central mountain communities.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Camas', why: 'Small central Idaho county adjacent to existing Gooding/Elmore coverage.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
  { county: 'Butte', why: 'Eastern-central Idaho county that may connect to the Idaho Falls/Rexburg side of the territory.', status: 'review', knownExpectedHighSchools: null, note: 'Do not import automatically; review boundary fit before adding.' },
];
