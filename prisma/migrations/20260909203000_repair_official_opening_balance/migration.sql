-- Corrige saldos de abertura calculados contra a quantidade cadastrada no SAGEP.
-- A base oficial é a quantidade registrada pela unidade gerenciadora; itens que já
-- possuem movimentação operacional ficam intocados para revisão manual.
UPDATE "AtaItem" AS item
SET
  "initialQuantity" = snapshot."managerRegisteredQuantity",
  "openingConsumedQuantity" = snapshot."managerRegisteredQuantity" - snapshot."managerAvailableQuantity",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AtaItemExternalBalanceSnapshot" AS snapshot
WHERE snapshot."ataItemId" = item."id"
  AND item."openingBalanceAppliedAt" IS NOT NULL
  AND snapshot."managerRegisteredQuantity" IS NOT NULL
  AND snapshot."managerAvailableQuantity" IS NOT NULL
  AND snapshot."managerRegisteredQuantity" >= snapshot."managerAvailableQuantity"
  AND NOT EXISTS (
    SELECT 1
    FROM "AtaItemBalanceMovement" AS movement
    WHERE movement."ataItemId" = item."id"
  );
