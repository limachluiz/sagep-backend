import { z } from "zod";
import { optionalBoolean } from "./zod-helpers.js";

export const restoreOptionsSchema = z.object({
  cascade: optionalBoolean,
});

export type RestoreOptions = z.infer<typeof restoreOptionsSchema>;
