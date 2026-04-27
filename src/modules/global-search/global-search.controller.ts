import { Request, Response } from "express";
import { globalSearchQuerySchema } from "./global-search.schemas.js";
import { GlobalSearchService } from "./global-search.service.js";

const globalSearchService = new GlobalSearchService();

export class GlobalSearchController {
  async search(req: Request, res: Response) {
    const filters = globalSearchQuerySchema.parse(req.query);
    const results = await globalSearchService.search(filters, req.user!);
    return res.status(200).json(results);
  }
}
