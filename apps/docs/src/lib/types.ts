export type DocsNavItem = {
  title: string;
  path: string;
};

export type DocsNavGroup = {
  title: string;
  items: DocsNavItem[];
};

export type DocsNavigation = {
  navigation: DocsNavGroup[];
};

export type WelcomeCard = {
  title: string;
  description: string;
  href: string;
};

export type DocPage = {
  path: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  startHereCards?: WelcomeCard[];
  featureCards?: WelcomeCard[];
};

export type TocHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type SearchResult = {
  slug: string;
  title: string;
  description: string;
  snippet: string;
};
