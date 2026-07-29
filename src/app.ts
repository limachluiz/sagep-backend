import express from "express";
import cors from "cors";
import { routes } from "./routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { requestContextMiddleware } from "./middlewares/request-context.middleware.js";
import { corsOptions } from "./config/cors.js";

export const app = express();

app.use(requestContextMiddleware);
app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (_req, res) => {
  return res.status(200).json({
    message: "SAGEP backend online",
    docs: "/api/docs",
    health: "/api/health",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", routes);

app.use(errorMiddleware);
