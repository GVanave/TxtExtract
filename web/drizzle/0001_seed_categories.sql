-- The fixed category list (must match lib/categories.ts).
INSERT INTO "categories" ("id", "slug", "name") VALUES
  (1, 'produce', 'Obst & Gemüse'),
  (2, 'dairy', 'Milchprodukte & Eier'),
  (3, 'meat_fish', 'Fleisch & Fisch'),
  (4, 'bakery', 'Brot & Backwaren'),
  (5, 'drinks', 'Getränke'),
  (6, 'snacks', 'Snacks & Süßes'),
  (7, 'pantry', 'Vorrat'),
  (8, 'frozen', 'Tiefkühl'),
  (9, 'household', 'Drogerie & Haushalt'),
  (10, 'other', 'Sonstiges')
ON CONFLICT ("id") DO UPDATE SET "slug" = EXCLUDED."slug", "name" = EXCLUDED."name";
