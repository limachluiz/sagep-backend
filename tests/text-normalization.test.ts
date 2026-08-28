import { describe, expect, it } from "vitest";
import { normalizeMojibakeText } from "../src/shared/text-normalization.js";

describe("normalizeMojibakeText", () => {
  it("fixes common Compras.gov mojibake without changing valid UTF-8 text", () => {
    expect(normalizeMojibakeText("SERVI\u00c3\u2021O")).toBe("SERVI\u00c7O");
    expect(normalizeMojibakeText("Elabora\u00c3\u00a7\u00c3\u00a3o")).toBe("Elabora\u00e7\u00e3o");
    expect(normalizeMojibakeText("Observa\u00c3\u00a7\u00c3\u00b5es")).toBe("Observa\u00e7\u00f5es");
    expect(normalizeMojibakeText("Vig\u00c3\u00aancia")).toBe("Vig\u00eancia");
    expect(normalizeMojibakeText("Elabora\u00e7\u00e3o de Servi\u00e7o")).toBe(
      "Elabora\u00e7\u00e3o de Servi\u00e7o",
    );
  });

  it("repairs common replacement-character mojibake when recoverable", () => {
    expect(normalizeMojibakeText("instala\ufffd\ufffdo")).toBe("instala\u00e7\u00e3o");
    expect(normalizeMojibakeText("fixa\ufffd\ufffdo")).toBe("fixa\u00e7\u00e3o");
    expect(normalizeMojibakeText("identifica\ufffd\ufffdo")).toBe("identifica\u00e7\u00e3o");
    expect(normalizeMojibakeText("SERVI\ufffdO")).toBe("SERVI\u00c7O");
    expect(normalizeMojibakeText("REGI\ufffdO 1 - MANAUS-AM")).toBe("REGIÃO 1 - MANAUS-AM");
    expect(normalizeMojibakeText("9/125 micr\ufffdmetros")).toBe("9/125 micrômetros");
    expect(normalizeMojibakeText("ponto l\ufffdgico")).toBe("ponto lógico");
    expect(normalizeMojibakeText("FUS\ufffdO e conex\ufffdo")).toBe("FUSÃO e conexão");
    expect(normalizeMojibakeText("infraestrutura necess\ufffdria")).toBe("infraestrutura necessária");
    expect(normalizeMojibakeText("S\ufffd\ufffdO GABRIEL DA CACHOEIRA")).toBe("SÃO GABRIEL DA CACHOEIRA");
    expect(normalizeMojibakeText("GUAJAR\ufffd-MIRIM")).toBe("GUAJARÁ-MIRIM");
    expect(normalizeMojibakeText("HUMAIT\ufffd-AM")).toBe("HUMAITÁ-AM");
    expect(normalizeMojibakeText("REGI\ufffd\ufffdO 5")).toBe("REGIÃO 5");
  });

  it("repairs a technical ATA description without corrupting valid accents", () => {
    const damaged =
      "Serviço TIPO I-B de lan�amento e instalação de cabo de fibra �ptica tipo DROP, " +
      "incluindo material para fixação, terminação SC/UPC Rosca e identificação: Cab o com uma " +
      "Fibra �ptica monomodo, contemplando: acess�rios para fixação e ident ificação do cabo; " +
      "utilizando m�todo de CABEAMENTO SUBTERR�NEO ou MND (M�todo n �o Destrut�vel).";

    expect(normalizeMojibakeText(damaged)).toBe(
      "Serviço TIPO I-B de lançamento e instalação de cabo de fibra óptica tipo DROP, " +
      "incluindo material para fixação, terminação SC/UPC Rosca e identificação: Cabo com uma " +
      "Fibra óptica monomodo, contemplando: acessórios para fixação e identificação do cabo; " +
      "utilizando método de CABEAMENTO SUBTERRÂNEO ou MND (Método não Destrutível).",
    );
  });

  it("repairs the known SIDI Manaus description fragments", () => {
    expect(normalizeMojibakeText(
      "Serviço incluin do material pa ra fixação. Dem ais características conforme Termo de Re ferência.",
    )).toBe(
      "Serviço incluindo material para fixação. Demais características conforme Termo de Referência.",
    );
  });

  it("repairs descriptions from items 2 through 6 of ARP 00001/2026", () => {
    const damagedDescriptions = [
      "Servi�o TIPO I-B de lan�amento e instala��o de cabo de fibra �ptica tipo DROP, " +
        "utilizando m�todo de CABEAMENTO SUBTERR�NEO ou MND (M�todo n �o Destrut�vel). " +
        "Demais caracter�sticas conforme Termo de Refer�ncia.",
      "Servi�o de instala��o com fornecimento de C�mera IP PoE do tipo Bullet para mo nitoramento " +
        "Convencional. Demais caracter�sticas conforme Termo de Refer�ncia.",
      "Servi�o de instala��o com fornecimento de C�mera IP PoE do tipo Dome para moni toramento " +
        "Convencional. Demais caracter�sticas conforme Termo de Refer�ncia.",
      "Servi�o de instala��o com fornecimento de C�mera IP PoE do tipo Bullet para mo nitoramento " +
        "Inteligente. Demais caracter�sticas conforme Termo de Refer�ncia.",
      "Servi�o de instala��o com fornecimento de C�mera IP do tipo Speed Dome de long o alcance. " +
        "Demais caracter�sticas conforme Termo de Refer�ncia.",
    ];

    expect(damagedDescriptions.map(normalizeMojibakeText)).toEqual([
      "Serviço TIPO I-B de lançamento e instalação de cabo de fibra óptica tipo DROP, " +
        "utilizando método de CABEAMENTO SUBTERRÂNEO ou MND (Método não Destrutível). " +
        "Demais características conforme Termo de Referência.",
      "Serviço de instalação com fornecimento de Câmera IP PoE do tipo Bullet para monitoramento " +
        "Convencional. Demais características conforme Termo de Referência.",
      "Serviço de instalação com fornecimento de Câmera IP PoE do tipo Dome para monitoramento " +
        "Convencional. Demais características conforme Termo de Referência.",
      "Serviço de instalação com fornecimento de Câmera IP PoE do tipo Bullet para monitoramento " +
        "Inteligente. Demais características conforme Termo de Referência.",
      "Serviço de instalação com fornecimento de Câmera IP do tipo Speed Dome de longo alcance. " +
        "Demais características conforme Termo de Referência.",
    ]);
  });
});
