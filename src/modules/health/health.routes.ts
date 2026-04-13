import { Router } from "express";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  return res.status(200).json({
    message: "SAGEP backend online",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});