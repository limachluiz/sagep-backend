-- Recupera o CNPJ de ATAs legadas somente quando todo o histórico de DIEx
-- da mesma ATA aponta, de forma inequívoca, para um único CNPJ de fornecedor.
WITH "UnambiguousAtaCnpj" AS (
  SELECT
    e."ataId",
    MIN(regexp_replace(d."supplierCnpj", '[^0-9]', '', 'g')) AS "vendorCnpj"
  FROM "DiexRequest" d
  INNER JOIN "Estimate" e ON e."id" = d."estimateId"
  WHERE length(regexp_replace(d."supplierCnpj", '[^0-9]', '', 'g')) = 14
  GROUP BY e."ataId"
  HAVING COUNT(DISTINCT regexp_replace(d."supplierCnpj", '[^0-9]', '', 'g')) = 1
)
UPDATE "Ata" a
SET "vendorCnpj" = recovered."vendorCnpj"
FROM "UnambiguousAtaCnpj" recovered
WHERE a."id" = recovered."ataId"
  AND (a."vendorCnpj" IS NULL OR length(regexp_replace(a."vendorCnpj", '[^0-9]', '', 'g')) <> 14);
