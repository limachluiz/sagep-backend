import { Request, Response } from "express";
import { integrationProviderSchema, portalApiTokenSchema, updateSystemSettingsSchema } from "./system-settings.schemas.js";
import { systemSettingsService } from "./system-settings.service.js";

export class SystemSettingsController {
  async get(_req: Request, res: Response) {
    return res.status(200).json(await systemSettingsService.get());
  }

  async update(req: Request, res: Response) {
    return res.status(200).json(await systemSettingsService.update(updateSystemSettingsSchema.parse(req.body), req.user!));
  }

  async testAll(req: Request, res: Response) {
    return res.status(200).json(await systemSettingsService.testAll(req.user!));
  }

  async testOne(req: Request, res: Response) {
    const { provider } = integrationProviderSchema.parse(req.params);
    return res.status(200).json(await systemSettingsService.testConnection(provider, req.user!));
  }

  async savePortalApiToken(req: Request, res: Response) {
    return res.status(200).json(await systemSettingsService.savePortalApiToken(portalApiTokenSchema.parse(req.body), req.user!));
  }

  async removePortalApiToken(req: Request, res: Response) {
    return res.status(200).json(await systemSettingsService.removePortalApiToken(req.user!));
  }
}
