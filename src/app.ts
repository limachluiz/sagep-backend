import express from "express";
import cors from "cors";
import helmet from "helmet";
import { routes } from "./routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { requestContextMiddleware } from "./middlewares/request-context.middleware.js";
import { corsOptions } from "./config/cors.js";
import { maintenanceMiddleware } from "./middlewares/maintenance.middleware.js";
import { apiRateLimiter } from "./middlewares/rate-limit.middleware.js";
import { env } from "./config/env.js";

export const app = express();

app.disable("x-powered-by");
if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);

app.use(requestContextMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);
app.use((req, res, next) => {
  const isApiDocs = req.path.startsWith("/api/docs");
  if (!isApiDocs) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  }
  if (req.path.startsWith("/api") && !isApiDocs) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});
app.use(cors(corsOptions));
app.use(maintenanceMiddleware);
app.use(express.json({ limit: "1mb", strict: true }));

app.get("/", (_req, res) => {
  return res.status(200).json({
    message: "SAGEP backend online",
    docs: "/api/docs",
    health: "/api/health",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", apiRateLimiter, routes);

app.use(errorMiddleware);
