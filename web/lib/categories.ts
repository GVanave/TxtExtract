/** Fixed spending categories. Ids are stored in the database; slugs are used by Gemini and in URLs. */
export const CATEGORIES = [
  { id: 1, slug: "produce", name: "Obst & Gemüse" },
  { id: 2, slug: "dairy", name: "Milchprodukte & Eier" },
  { id: 3, slug: "meat_fish", name: "Fleisch & Fisch" },
  { id: 4, slug: "bakery", name: "Brot & Backwaren" },
  { id: 5, slug: "drinks", name: "Getränke" },
  { id: 6, slug: "snacks", name: "Snacks & Süßes" },
  { id: 7, slug: "pantry", name: "Vorrat" },
  { id: 8, slug: "frozen", name: "Tiefkühl" },
  { id: 9, slug: "household", name: "Drogerie & Haushalt" },
  { id: 10, slug: "other", name: "Sonstiges" },
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategorySlug = Category["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

/** Products without a category yet (e.g. imported from the old spreadsheet). */
export const UNCATEGORIZED = { slug: "uncategorized", name: "Nicht zugeordnet" } as const;

export const categoryBySlug = (slug: string | null | undefined) => CATEGORIES.find((c) => c.slug === slug) ?? null;
export const categoryById = (id: number | null | undefined) => CATEGORIES.find((c) => c.id === id) ?? null;
export const categoryName = (slug: string | null | undefined) => categoryBySlug(slug)?.name ?? UNCATEGORIZED.name;

/** Gemini guesses, the user's earlier correction ("memory"), or the user on this receipt. */
export const CATEGORY_SOURCES = ["model", "memory", "user"] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];
