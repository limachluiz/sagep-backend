import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

type CurrentUser = {
  id: string;
  role: string;
};

type GlobalSearchFilters = {
  q: string;
  limit?: number;
};

const federativeUnits = ["AM", "RO", "RR", "AC"] as const;

export class GlobalSearchService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private getProjectAccessWhere(user: CurrentUser): Prisma.ProjectWhereInput {
    if (this.isPrivileged(user.role)) {
      return {};
    }

    return {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
  }

  private parseCode(term: string) {
    const match = term.match(/\d+/);
    return match ? Number(match[0]) : undefined;
  }

  private parseUf(term: string) {
    const upper = term.trim().toUpperCase();
    return federativeUnits.find((uf) => uf === upper);
  }

  private parseAtaTypes(term: string) {
    const normalized = term
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();

    const types: Array<"CFTV" | "FIBRA_OPTICA"> = [];

    if (normalized.includes("CFTV")) {
      types.push("CFTV");
    }

    if (normalized.includes("FIBRA") || normalized.includes("FIBRA_OPTICA")) {
      types.push("FIBRA_OPTICA");
    }

    return types;
  }

  async search(filters: GlobalSearchFilters, user: CurrentUser) {
    const term = filters.q.trim();
    const limit = filters.limit ?? 8;
    const code = this.parseCode(term);
    const uf = this.parseUf(term);
    const ataTypes = this.parseAtaTypes(term);
    const projectAccessWhere = this.getProjectAccessWhere(user);

    const [projects, estimates, diexRequests, serviceOrders] = await Promise.all([
      prisma.project.findMany({
        where: {
          AND: [
            projectAccessWhere,
            {
              OR: [
                ...(code ? [{ projectCode: code }] : []),
                { title: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
                { owner: { name: { contains: term, mode: "insensitive" } } },
                { owner: { email: { contains: term, mode: "insensitive" } } },
                { members: { some: { user: { name: { contains: term, mode: "insensitive" } } } } },
                { estimates: { some: { omName: { contains: term, mode: "insensitive" } } } },
                { estimates: { some: { destinationCityName: { contains: term, mode: "insensitive" } } } },
                ...(uf ? [{ estimates: { some: { destinationStateUf: uf } } }] : []),
                ...(ataTypes.length
                  ? [{ estimates: { some: { ata: { type: { in: ataTypes } } } } }]
                  : []),
                { diexRequests: { some: { diexNumber: { contains: term, mode: "insensitive" } } } },
                { serviceOrders: { some: { serviceOrderNumber: { contains: term, mode: "insensitive" } } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          stage: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          estimates: {
            select: {
              omName: true,
              destinationCityName: true,
              destinationStateUf: true,
              ata: {
                select: {
                  type: true,
                },
              },
            },
            take: 3,
          },
          updatedAt: true,
        },
        orderBy: { projectCode: "asc" },
        take: limit,
      }),
      prisma.estimate.findMany({
        where: {
          AND: [
            { project: projectAccessWhere },
            {
              OR: [
                ...(code ? [{ estimateCode: code }, { project: { projectCode: code } }] : []),
                { project: { title: { contains: term, mode: "insensitive" } } },
                { project: { owner: { name: { contains: term, mode: "insensitive" } } } },
                { omName: { contains: term, mode: "insensitive" } },
                { destinationCityName: { contains: term, mode: "insensitive" } },
                ...(uf ? [{ destinationStateUf: uf }] : []),
                ...(ataTypes.length ? [{ ata: { type: { in: ataTypes } } }] : []),
                { ata: { number: { contains: term, mode: "insensitive" } } },
                { ata: { vendorName: { contains: term, mode: "insensitive" } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          estimateCode: true,
          status: true,
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
              projectCode: true,
              title: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          ata: {
            select: {
              id: true,
              ataCode: true,
              number: true,
              type: true,
            },
          },
        },
        orderBy: { estimateCode: "asc" },
        take: limit,
      }),
      prisma.diexRequest.findMany({
        where: {
          AND: [
            { project: projectAccessWhere },
            {
              OR: [
                ...(code ? [{ diexCode: code }, { project: { projectCode: code } }] : []),
                { diexNumber: { contains: term, mode: "insensitive" } },
                { requesterName: { contains: term, mode: "insensitive" } },
                { supplierName: { contains: term, mode: "insensitive" } },
                { project: { title: { contains: term, mode: "insensitive" } } },
                { project: { owner: { name: { contains: term, mode: "insensitive" } } } },
                { estimate: { omName: { contains: term, mode: "insensitive" } } },
                { estimate: { destinationCityName: { contains: term, mode: "insensitive" } } },
                ...(uf ? [{ estimate: { destinationStateUf: uf } }] : []),
                ...(ataTypes.length ? [{ estimate: { ata: { type: { in: ataTypes } } } }] : []),
              ],
            },
          ],
        },
        select: {
          id: true,
          diexCode: true,
          diexNumber: true,
          issuedAt: true,
          documentStatus: true,
          requesterName: true,
          supplierName: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
              projectCode: true,
              title: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          estimate: {
            select: {
              id: true,
              estimateCode: true,
              omName: true,
              destinationCityName: true,
              destinationStateUf: true,
              ata: {
                select: {
                  type: true,
                },
              },
            },
          },
        },
        orderBy: { diexCode: "asc" },
        take: limit,
      }),
      prisma.serviceOrder.findMany({
        where: {
          AND: [
            { project: projectAccessWhere },
            {
              OR: [
                ...(code ? [{ serviceOrderCode: code }, { project: { projectCode: code } }] : []),
                { serviceOrderNumber: { contains: term, mode: "insensitive" } },
                { requesterName: { contains: term, mode: "insensitive" } },
                { contractorName: { contains: term, mode: "insensitive" } },
                { projectDisplayName: { contains: term, mode: "insensitive" } },
                { project: { title: { contains: term, mode: "insensitive" } } },
                { project: { owner: { name: { contains: term, mode: "insensitive" } } } },
                { estimate: { omName: { contains: term, mode: "insensitive" } } },
                { estimate: { destinationCityName: { contains: term, mode: "insensitive" } } },
                ...(uf ? [{ estimate: { destinationStateUf: uf } }] : []),
                ...(ataTypes.length ? [{ estimate: { ata: { type: { in: ataTypes } } } }] : []),
                { diexRequest: { diexNumber: { contains: term, mode: "insensitive" } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          serviceOrderCode: true,
          serviceOrderNumber: true,
          issuedAt: true,
          documentStatus: true,
          requesterName: true,
          contractorName: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
              projectCode: true,
              title: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          estimate: {
            select: {
              id: true,
              estimateCode: true,
              omName: true,
              destinationCityName: true,
              destinationStateUf: true,
              ata: {
                select: {
                  type: true,
                },
              },
            },
          },
          diexRequest: {
            select: {
              id: true,
              diexCode: true,
              diexNumber: true,
            },
          },
        },
        orderBy: { serviceOrderCode: "asc" },
        take: limit,
      }),
    ]);

    return {
      query: term,
      limit,
      groups: {
        projects: projects.map((project) => ({
          type: "PROJECT",
          id: project.id,
          code: `PRJ-${project.projectCode}`,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          responsible: project.owner,
          context: {
            estimates: project.estimates,
          },
          updatedAt: project.updatedAt,
        })),
        estimates: estimates.map((estimate) => ({
          type: "ESTIMATE",
          id: estimate.id,
          code: `EST-${estimate.estimateCode}`,
          estimateCode: estimate.estimateCode,
          title: `Estimativa EST-${estimate.estimateCode}`,
          status: estimate.status,
          project: estimate.project,
          omName: estimate.omName,
          destinationCityName: estimate.destinationCityName,
          destinationStateUf: estimate.destinationStateUf,
          ata: estimate.ata,
          totalAmount: estimate.totalAmount,
        })),
        diexRequests: diexRequests.map((diex) => ({
          type: "DIEX_REQUEST",
          id: diex.id,
          code: `DIEX-${diex.diexCode}`,
          diexCode: diex.diexCode,
          title: diex.diexNumber ?? `DIEx #${diex.diexCode}`,
          documentNumber: diex.diexNumber,
          documentStatus: diex.documentStatus,
          issuedAt: diex.issuedAt,
          requesterName: diex.requesterName,
          supplierName: diex.supplierName,
          project: diex.project,
          estimate: diex.estimate,
          totalAmount: diex.totalAmount,
        })),
        serviceOrders: serviceOrders.map((serviceOrder) => ({
          type: "SERVICE_ORDER",
          id: serviceOrder.id,
          code: `OS-${serviceOrder.serviceOrderCode}`,
          serviceOrderCode: serviceOrder.serviceOrderCode,
          title: serviceOrder.serviceOrderNumber,
          documentNumber: serviceOrder.serviceOrderNumber,
          documentStatus: serviceOrder.documentStatus,
          issuedAt: serviceOrder.issuedAt,
          requesterName: serviceOrder.requesterName,
          contractorName: serviceOrder.contractorName,
          project: serviceOrder.project,
          estimate: serviceOrder.estimate,
          diexRequest: serviceOrder.diexRequest,
          totalAmount: serviceOrder.totalAmount,
        })),
      },
      total:
        projects.length +
        estimates.length +
        diexRequests.length +
        serviceOrders.length,
    };
  }
}
