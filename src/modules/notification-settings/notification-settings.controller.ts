import type { Request, Response } from "express";
import { emailListIdSchema, emailListSchema, notificationAutomationSchema, smtpSettingsSchema, smtpTestSchema, telegramSettingsSchema } from "./notification-settings.schemas.js";
import { notificationSettingsService } from "./notification-settings.service.js";
import { notificationAutomationService } from "./notification-automation.service.js";

export class NotificationSettingsController {
  get(req: Request, res: Response) { return notificationSettingsService.get().then((result) => res.json(result)); }
  saveSmtp(req: Request, res: Response) { return notificationSettingsService.saveSmtp(smtpSettingsSchema.parse(req.body), req.user!).then((result) => res.json(result)); }
  testSmtp(req: Request, res: Response) { return notificationSettingsService.testSmtp(smtpTestSchema.parse(req.body).recipient, req.user!).then((result) => res.json(result)); }
  saveTelegram(req: Request, res: Response) { return notificationSettingsService.saveTelegram(telegramSettingsSchema.parse(req.body), req.user!).then((result) => res.json(result)); }
  testTelegram(req: Request, res: Response) { return notificationSettingsService.testTelegram(req.user!).then((result) => res.json(result)); }
  createList(req: Request, res: Response) { return notificationSettingsService.createEmailList(emailListSchema.parse(req.body), req.user!).then((result) => res.status(201).json(result)); }
  updateList(req: Request, res: Response) { return notificationSettingsService.updateEmailList(emailListIdSchema.parse(req.params.id), emailListSchema.parse(req.body), req.user!).then((result) => res.json(result)); }
  deleteList(req: Request, res: Response) { return notificationSettingsService.deleteEmailList(emailListIdSchema.parse(req.params.id), req.user!).then((result) => res.json(result)); }
  automation(req: Request, res: Response) { return notificationAutomationService.overview().then((result) => res.json(result)); }
  saveAutomation(req: Request, res: Response) { return notificationAutomationService.save(notificationAutomationSchema.parse(req.body), req.user!).then((result) => res.json(result)); }
  runAutomation(req: Request, res: Response) { return notificationAutomationService.enqueueManual(req.user!).then((result) => res.status(202).json(result)); }
}
