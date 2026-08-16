import { systemSettingsService } from "../system-settings/system-settings.service.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/app-error.js";

type PncpAtaResponse = Record<string, unknown> & {
  numeroControlePNCP?: string;
  numeroAtaRegistroPreco?: string;
  anoAta?: number;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  dataAtualizacao?: string;
  dataAtualizacaoGlobal?: string;
  cancelado?: boolean;
  possibilidadeAdesao?: boolean;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { codigoUnidade?: string; nomeUnidade?: string; municipioNome?: string; ufSigla?: string };
};

type PncpContractsResponse = {
  data?: Array<Record<string, unknown>>;
  totalRegistros?: number;
};

export type PncpAtaSnapshot = {
  source: "PNCP";
  controlNumber: string;
  ataNumber: string | null;
  ataYear: number | null;
  validFrom: string | null;
  validUntil: string | null;
  cancelled: boolean;
  allowsAdhesion: boolean | null;
  organization: { cnpj: string | null; name: string | null };
  managingUnit: {
    code: string | null;
    name: string | null;
    city: string | null;
    state: string | null;
  };
  linkedContracts: {
    total: number;
    records: Array<Record<string, unknown>>;
  };
  sourceUpdatedAt: string | null;
  checkedAt: string;
};

class PncpRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly url: string,
  ) {
    super(message);
  }
}

export class PncpService {
  private parseControlNumber(controlNumber: string) {
    const match = controlNumber.trim().match(/^(\d{14})-\d-(\d+)\/(\d{4})-(\d+)$/);
    if (!match) return null;
    return {
      cnpj: match[1],
      purchaseSequence: String(Number(match[2])),
      purchaseYear: match[3],
      ataSequence: String(Number(match[4])),
    };
  }

  private async request<T>(url: URL) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(env.PNCP_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new PncpRequestError("PNCP não respondeu à consulta", null, url.toString());
    }

    if (!response.ok) {
      throw new PncpRequestError(
        `PNCP respondeu com HTTP ${response.status}`,
        response.status,
        url.toString(),
      );
    }

    return (await response.json()) as T;
  }

  async fetchAtaSnapshot(controlNumber: string): Promise<PncpAtaSnapshot> {
    const parsed = this.parseControlNumber(controlNumber);
    if (!parsed) {
      throw new PncpRequestError("Número de controle PNCP inválido", null, controlNumber);
    }

    const settings = await systemSettingsService.getEffective();
    const path = `/v1/orgaos/${parsed.cnpj}/compras/${parsed.purchaseYear}/${parsed.purchaseSequence}/atas/${parsed.ataSequence}`;
    const baseUrl = settings.pncpBaseUrl.replace(/\/$/, "");
    const ataUrl = new URL(`${baseUrl}${path}`);
    const contractsUrl = new URL(`${baseUrl}${path}/contratos`);

    const [ata, contractsResult] = await Promise.all([
      this.request<PncpAtaResponse>(ataUrl),
      this.request<PncpContractsResponse>(contractsUrl).catch((error: unknown) => {
        if (error instanceof PncpRequestError && error.status === 404) {
          return { data: [], totalRegistros: 0 } satisfies PncpContractsResponse;
        }
        throw error;
      }),
    ]);

    const contracts = contractsResult.data ?? [];
    return {
      source: "PNCP",
      controlNumber: ata.numeroControlePNCP ?? controlNumber,
      ataNumber: ata.numeroAtaRegistroPreco ?? null,
      ataYear: ata.anoAta ?? null,
      validFrom: ata.dataVigenciaInicio ?? null,
      validUntil: ata.dataVigenciaFim ?? null,
      cancelled: Boolean(ata.cancelado),
      allowsAdhesion:
        typeof ata.possibilidadeAdesao === "boolean" ? ata.possibilidadeAdesao : null,
      organization: {
        cnpj: ata.orgaoEntidade?.cnpj ?? null,
        name: ata.orgaoEntidade?.razaoSocial ?? null,
      },
      managingUnit: {
        code: ata.unidadeOrgao?.codigoUnidade ?? null,
        name: ata.unidadeOrgao?.nomeUnidade ?? null,
        city: ata.unidadeOrgao?.municipioNome ?? null,
        state: ata.unidadeOrgao?.ufSigla ?? null,
      },
      linkedContracts: {
        total: contractsResult.totalRegistros ?? contracts.length,
        records: contracts.slice(0, 100),
      },
      sourceUpdatedAt: ata.dataAtualizacaoGlobal ?? ata.dataAtualizacao ?? null,
      checkedAt: new Date().toISOString(),
    };
  }

  async syncAta(ataId: string) {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        id: true,
        ataCode: true,
        number: true,
        externalPncpControlNumber: true,
      },
    });

    if (!ata) {
      throw new AppError("Ata não encontrada", 404);
    }

    if (!ata.externalPncpControlNumber) {
      throw new AppError("ATA sem número de controle do PNCP", 400);
    }

    const snapshot = await this.fetchAtaSnapshot(ata.externalPncpControlNumber);
    const lastSyncAt = new Date();

    await prisma.ata.update({
      where: { id: ata.id },
      data: {
        externalPncpControlNumber: snapshot.controlNumber,
        pncpSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        pncpLastSyncAt: lastSyncAt,
      },
    });

    return {
      ata: {
        id: ata.id,
        ataCode: ata.ataCode,
        number: ata.number,
      },
      controlNumber: snapshot.controlNumber,
      lastSyncAt,
      snapshot,
    };
  }
}

export const pncpService = new PncpService();
