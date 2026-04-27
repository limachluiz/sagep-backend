import { z } from "zod";
import { optionalDate } from "../../shared/zod-helpers.js";

export const dashboardPeriodTypeEnum = z.enum([
  "month",
  "quarter",
  "semester",
  "year",
]);

export const dashboardOverviewQuerySchema = z
  .object({
    periodType: dashboardPeriodTypeEnum.optional(),
    referenceDate: optionalDate,
    startDate: optionalDate,
    endDate: optionalDate,
    asOfDate: optionalDate,
  })
  .refine(
    (data) =>
      !(
        data.asOfDate &&
        (data.periodType || data.referenceDate || data.startDate || data.endDate)
      ),
    {
      message:
        "asOfDate não pode ser combinado com periodType, referenceDate, startDate ou endDate",
      path: ["asOfDate"],
    }
  )
  .refine(
    (data) => !((data.startDate || data.endDate) && (data.periodType || data.referenceDate)),
    {
      message:
        "startDate/endDate não podem ser combinados com periodType/referenceDate",
      path: ["startDate"],
    }
  )
  .refine((data) => Boolean(data.startDate) === Boolean(data.endDate), {
    message: "Informe startDate e endDate juntos",
    path: ["startDate"],
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      data.endDate.getTime() >= data.startDate.getTime(),
    {
      message: "endDate não pode ser menor que startDate",
      path: ["endDate"],
    }
  );

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;

export const dashboardOperationalQuerySchema = z.object({
  staleDays: z.coerce.number().int().positive().max(365).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const dashboardExecutiveQuerySchema = dashboardOverviewQuerySchema;

export type DashboardOperationalQuery = z.infer<typeof dashboardOperationalQuerySchema>;
export type DashboardExecutiveQuery = z.infer<typeof dashboardExecutiveQuerySchema>;
