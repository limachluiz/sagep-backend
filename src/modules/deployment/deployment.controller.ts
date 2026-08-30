import type { Request, Response } from "express";
import { deploymentService } from "./deployment.service.js";
import {
  exportAuthorityBackupSchema,
  initializeInternalCertificateSchema,
  restoreAuthorityBackupSchema,
  trustKitPlatformSchema,
  updateDeploymentSchema,
} from "./deployment.schemas.js";

export class DeploymentController {
  async get(_req: Request, res: Response) {
    return res.status(200).json(await deploymentService.get());
  }

  async update(req: Request, res: Response) {
    return res.status(200).json(await deploymentService.update(updateDeploymentSchema.parse(req.body), req.user!));
  }

  async diagnostics(_req: Request, res: Response) {
    return res.status(200).json(await deploymentService.diagnostics());
  }

  async preflight(_req: Request, res: Response) {
    return res.status(200).json(await deploymentService.preflight());
  }

  async initializeCertificate(req: Request, res: Response) {
    return res.status(201).json(await deploymentService.initializeInternalCertificate(initializeInternalCertificateSchema.parse(req.body), req.user!));
  }

  async renewCertificate(req: Request, res: Response) {
    return res.status(201).json(await deploymentService.renewServerCertificate(req.user!));
  }

  async exportAuthority(req: Request, res: Response) {
    const archive = await deploymentService.exportAuthorityBackup(exportAuthorityBackupSchema.parse(req.body), req.user!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${archive.filename}"`);
    return res.status(200).send(archive.buffer);
  }

  async restoreAuthority(req: Request, res: Response) {
    return res.status(200).json(await deploymentService.restoreAuthorityBackup(restoreAuthorityBackupSchema.parse(req.body), req.user!));
  }

  async trustKit(req: Request, res: Response) {
    const { platform } = trustKitPlatformSchema.parse(req.params);
    const kit = await deploymentService.trustKit(platform, req.user!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${kit.filename}"`);
    return res.status(200).send(kit.buffer);
  }
}
