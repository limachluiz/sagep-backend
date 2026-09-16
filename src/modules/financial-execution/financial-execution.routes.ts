import { archiveCodeSchema, archiveQuerySchema, importDiscoveredNote, listArchivedNotes, deleteArchivedNote } from "./ne-archive.service.js";
import { discoveryOptions, discoveryPage, discoveryPageSchema, discoveryDocuments } from "./ne-discovery.service.js";
import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { FinancialExecutionController } from "./financial-execution.controller.js";

export const financialExecutionRoutes = Router();
const controller = new FinancialExecutionController();

financialExecutionRoutes.use(authMiddleware);
financialExecutionRoutes.get("/discovery/archive", requirePermission("financial_execution.view"), async (req, res) => { res.json(await listArchivedNotes(archiveQuerySchema.parse(req.query))); });
financialExecutionRoutes.post("/discovery/archive/:code", requirePermission("financial_execution.manage"), async (req, res) => { res.json(await importDiscoveredNote(archiveCodeSchema.parse(req.params.code), req.user!.id)); });
financialExecutionRoutes.delete("/discovery/archive/:code", requirePermission("financial_execution.manage"), async (req, res) => { await deleteArchivedNote(archiveCodeSchema.parse(req.params.code)); res.status(204).end(); });
financialExecutionRoutes.get("/discovery/options", requirePermission("financial_execution.view"), async (_req, res) => { res.json(await discoveryOptions()); });
financialExecutionRoutes.post("/discovery/page", requirePermission("financial_execution.view"), async (req, res) => { res.json(await discoveryPage(discoveryPageSchema.parse(req.body))); });
financialExecutionRoutes.get("/discovery/documents/:code", requirePermission("financial_execution.view"), async (req, res) => { res.json(await discoveryDocuments(String(req.params.code))); });
financialExecutionRoutes.get("/commitment-notes", requirePermission("financial_execution.view"), (req, res) => controller.list(req, res));
financialExecutionRoutes.get("/commitment-notes/:id", requirePermission("financial_execution.view"), (req, res) => controller.details(req, res));
financialExecutionRoutes.get("/summary", requirePermission("financial_execution.view"), (req, res) => controller.summary(req, res));
financialExecutionRoutes.post("/commitment-notes/lookup", requirePermission("financial_execution.view"), (req, res) => controller.lookup(req, res));
financialExecutionRoutes.post("/commitment-notes/preview", requirePermission("financial_execution.manage"), (req, res) => controller.preview(req, res));
financialExecutionRoutes.post("/commitment-notes", requirePermission("financial_execution.manage"), (req, res) => controller.register(req, res));
financialExecutionRoutes.post("/commitment-notes/:id/sync", requirePermission("financial_execution.sync"), (req, res) => controller.syncOne(req, res));
financialExecutionRoutes.post("/sync", requirePermission("financial_execution.sync"), (req, res) => controller.syncAll(req, res));
financialExecutionRoutes.post("/invoices", requirePermission("financial_execution.manage"), (req, res) => controller.createInvoice(req, res));
