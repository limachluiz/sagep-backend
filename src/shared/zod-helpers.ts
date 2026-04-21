import { z } from "zod";

export const optionalBoolean = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "sim", "yes"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "nao", "não", "no"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());