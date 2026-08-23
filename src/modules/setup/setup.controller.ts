import type { Request, Response } from "express";
import { initializeSetupSchema } from "./setup.schemas.js";
import { SetupService } from "./setup.service.js";

const service = new SetupService();

export class SetupController {
  async status(_req: Request, res: Response) {
    return res.status(200).json(await service.status());
  }

  async initialize(req: Request, res: Response) {
    const input = initializeSetupSchema.parse(req.body);
    const result = await service.initialize(input, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.status(201).json(result);
  }
}
