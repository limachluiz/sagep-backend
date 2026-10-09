import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { documentVersionsService } from "./document-versions.service.js";
import { documentVersionIdSchema, documentVersionListSchema, invalidateDocumentVersionSchema, signatureValidationSchema, signedDocumentSchema } from "./document-versions.schemas.js";

export const documentVersionsRoutes = Router();
documentVersionsRoutes.use(authMiddleware);
documentVersionsRoutes.get("/", requirePermission("reports.export"), async (req, res) => res.json(await documentVersionsService.list(documentVersionListSchema.parse(req.query))));
documentVersionsRoutes.get("/:id/download", requirePermission("reports.export"), async (req, res) => {
  const { id } = documentVersionIdSchema.parse(req.params);
  const { version, buffer } = await documentVersionsService.download(id);
  res.setHeader("Content-Type", version.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${version.filename.replace(/[\r\n\"]/g, "-")}"`);
  res.setHeader("X-Document-SHA256", version.checksumSha256);
  return res.send(buffer);
});
documentVersionsRoutes.post("/:id/signed", requirePermission("reports.export"), async (req, res) => { const { id } = documentVersionIdSchema.parse(req.params); return res.status(201).json(await documentVersionsService.registerSigned(id, signedDocumentSchema.parse(req.body), req.user!)); });
documentVersionsRoutes.patch("/:id/signature-validation", requirePermission("settings.manage"), async (req, res) => { const { id } = documentVersionIdSchema.parse(req.params); return res.json(await documentVersionsService.recordValidation(id, signatureValidationSchema.parse(req.body), req.user!)); });
documentVersionsRoutes.patch("/:id/invalidate", requirePermission("settings.manage"), async (req, res) => { const { id } = documentVersionIdSchema.parse(req.params); return res.json(await documentVersionsService.invalidate(id, invalidateDocumentVersionSchema.parse(req.body).reason, req.user!)); });
