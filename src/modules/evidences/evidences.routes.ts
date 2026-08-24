import express, { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { env } from "../../config/env.js";
import { EvidencesController } from "./evidences.controller.js";

export const evidencesRoutes = Router();
const controller = new EvidencesController();
evidencesRoutes.use(authMiddleware);
evidencesRoutes.get("/", (req, res) => controller.list(req, res));
evidencesRoutes.post("/", express.raw({ type: "application/octet-stream", limit: `${env.EVIDENCE_MAX_UPLOAD_MB}mb` }), (req, res) => controller.upload(req, res));
evidencesRoutes.get("/:id/content", (req, res) => controller.download(req, res));
evidencesRoutes.patch("/:id", (req, res) => controller.update(req, res));
evidencesRoutes.delete("/:id", (req, res) => controller.remove(req, res));
