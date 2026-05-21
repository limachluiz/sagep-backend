import { z } from "zod";
import { optionalBoolean } from "../../shared/zod-helpers.js";

const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const coverageLocalitySchema = z.object({
  cityName: z.string().trim().min(2, "Cidade invalida"),
  stateUf: ufEnum,
});

export const comprasGovAtaPreviewQuerySchema = z.object({
  uasg: z.string().trim().min(1, "UASG e obrigatoria"),
  numeroPregao: z.string().trim().min(1, "Numero do pregao e obrigatorio"),
  anoPregao: z.string().trim().regex(/^\d{4}$/, "Ano do pregao deve ter 4 digitos"),
  numeroAta: z.string().trim().optional(),
});

export const comprasGovAtaImportSchema = comprasGovAtaPreviewQuerySchema.extend({
  ataType: z.enum(["CFTV", "FIBRA_OPTICA"]),
  coverageGroupId: z.string().trim().min(1).optional(),
  coverageGroupCode: z.string().trim().min(2).optional(),
  coverageGroupName: z.string().trim().min(2).optional(),
  coverageGroupStateUf: ufEnum.optional(),
  coverageGroupCityName: z.string().trim().min(2).optional(),
  coverageGroupLocalities: z.array(coverageLocalitySchema).min(1).optional(),
  dryRun: optionalBoolean,
});
