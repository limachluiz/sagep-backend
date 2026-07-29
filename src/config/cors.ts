import { CorsOptions } from "cors";
import { env } from "./env.js";
import { AppError } from "../shared/app-error.js";

const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

export const corsOptions: CorsOptions = {
  credentials: env.CORS_ALLOW_CREDENTIALS,
  origin(origin, callback) {
    // Chamadas server-to-server, health checks, scripts e clientes REST nao enviam Origin.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(
      new AppError(
        "Origem não permitida pelo CORS",
        403,
        "CORS_ORIGIN_DENIED",
        { origin },
      ),
    );
  },
};
