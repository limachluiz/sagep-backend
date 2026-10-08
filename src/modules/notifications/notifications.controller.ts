import type { Request, Response } from "express";
import { notificationIdSchema, notificationListQuerySchema } from "./notifications.schemas.js";
import { notificationsService } from "./notifications.service.js";

export class NotificationsController {
  list(req: Request, res: Response) {
    return notificationsService.list(req.user!.id, notificationListQuerySchema.parse(req.query)).then((result) => res.json(result));
  }
  markRead(req: Request, res: Response) {
    return notificationsService.markRead(notificationIdSchema.parse(req.params.id), req.user!.id).then((result) => res.json(result));
  }
  markAllRead(req: Request, res: Response) {
    return notificationsService.markAllRead(req.user!.id).then((result) => res.json(result));
  }
  dismiss(req: Request, res: Response) {
    return notificationsService.dismiss(notificationIdSchema.parse(req.params.id), req.user!.id).then((result) => res.json(result));
  }
}

