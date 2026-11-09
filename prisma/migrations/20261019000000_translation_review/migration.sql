-- Shopify locales with "Translation review" on (JSON array), e.g. ["de"]; existing shops start with none.
ALTER TABLE "ShopSettings" ADD COLUMN "reviewLocales" TEXT NOT NULL DEFAULT '[]';
