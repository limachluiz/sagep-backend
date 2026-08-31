import { z } from "zod";
import { isCanonicalPrivateIpv4Cidr, normalizePrivateIpv4Cidrs } from "../../shared/network.js";

const optionalText = z.string().trim().max(255).nullable().optional();
const list = z.array(z.string().trim().min(1).max(255)).max(12).default([]);
const allowedNetworks = z.array(z.string().trim().refine(
  isCanonicalPrivateIpv4Cidr,
  "Informe uma rede IPv4 privada em CIDR, usando o endereço da rede, por exemplo 192.168.0.0/16",
)).max(12).default([]).transform(normalizePrivateIpv4Cidrs);

export const initializeSetupSchema = z.object({
  setupToken: z.string().min(32).max(256),
  administrator: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    password: z.string()
      .min(12, "A senha inicial deve possuir pelo menos 12 caracteres")
      .max(128)
      .regex(/[a-z]/, "Inclua uma letra minúscula")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[0-9]/, "Inclua um número")
      .regex(/[^A-Za-z0-9]/, "Inclua um caractere especial"),
  }),
  organization: z.object({
    name: z.string().trim().min(3).max(160),
    acronym: z.string().trim().min(2).max(40),
    cityName: z.string().trim().min(2).max(120),
    stateUf: z.enum(["AM", "RO", "RR", "AC"]),
    uasg: z.string().trim().regex(/^\d{6}$/, "A UASG deve possuir 6 dígitos"),
    management: z.string().trim().regex(/^\d{5}$/, "A Gestão deve possuir 5 dígitos"),
    timeZone: z.string().trim().min(3).max(80).default("America/Manaus"),
    commandName: z.string().trim().min(3).max(160),
  }),
  network: z.object({
    hostName: z.string().trim().toLowerCase().max(253).regex(
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      "Informe um nome DNS completo",
    ).nullable().optional(),
    expectedIp: optionalText,
    gateway: optionalText,
    dnsServers: list,
    ntpServers: list,
    allowedNetworks,
    proxyUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
  }),
});

export type InitializeSetupInput = z.infer<typeof initializeSetupSchema>;
