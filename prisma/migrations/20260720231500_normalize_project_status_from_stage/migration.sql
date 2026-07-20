-- O status macro passa a ser derivado exclusivamente da etapa do workflow.
UPDATE "Project"
SET "status" = CASE
  WHEN "stage" = 'ESTIMATIVA_PRECO' THEN 'PLANEJAMENTO'::"ProjectStatus"
  WHEN "stage" = 'SERVICO_CONCLUIDO' THEN 'CONCLUIDO'::"ProjectStatus"
  WHEN "stage" = 'CANCELADO' THEN 'CANCELADO'::"ProjectStatus"
  ELSE 'EM_ANDAMENTO'::"ProjectStatus"
END;
