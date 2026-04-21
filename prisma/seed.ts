import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const adminUser = {
  name: "Luiz Henrique Chagas de Lima",
  email: "admin@sagep.com",
  password: "123456",
  role: "ADMIN" as const,
  rank: "2º Ten",
  cpf: "96208023220",
};

const oms = [
  { sigla: "16ª Ba Log", name: "16ª BASE LOGISTICA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "4º B Av Ex", name: "4º BATALHAO DE AVIACAO DO EXERCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "5º BEC", name: "5º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "6º BEC", name: "6º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "7º BEC", name: "7º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Rio Branco", stateUf: "AC" },
  { sigla: "Nu 1ª B Com GE Sl", name: "Núcleo do 1º Batalhão de Comunicações e Guerra Eletrônica de Selva", cityName: "Manaus", stateUf: "AM" },
  { sigla: "1º BIS (Amv)", name: "1º BATALHAO DE INFANTARIA DE SELVA (AEROMOVEL)", cityName: "Manaus", stateUf: "AM" },
  { sigla: "3º BIS", name: "3º BATALHAO DE INFANTARIA DE SELVA", cityName: "Barcelos", stateUf: "AM" },
  { sigla: "17º BIS", name: "17º BATALHAO DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "54º BIS", name: "54º BATALHAO DE INFANTARIA DE SELVA", cityName: "Humaitá", stateUf: "AM" },
  { sigla: "1º B Log Sl", name: "1ª BATALHAO LOGISTICO DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "7º BPE", name: "7º BATALHAO DE POLICIA DO EXERCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "2º B Log Sl", name: "2º BATALHÃO LOGÍSTICO DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "17º B Log Sl", name: "17º Batalhão Logístico de Selva", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "12º B Sup", name: "12º BATALHAO DE SUPRIMENTO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "12º GAAAe Sl", name: "12º GRUPO DE ARTILHARIA ANTIAEREA DE SELVA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "4º CTA", name: "4º CENTRO DE TELEMATICA DE AREA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CECMA", name: "CENTRO DE EMBARCACOES DO COMANDO MILITAR DA AMAZONIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CFR-Manaus", name: "CENTRO DE FORMAÇÃO DE RESERVISTA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CIGS", name: "CENTRO DE INSTRUCAO DE GUERRA NA SELVA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CMM", name: "COLEGIO MILITAR DE MANAUS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo Fron-AC/4º BIS", name: "COMANDO DE FRONTEIRA DO ACRE / 4º BATALHAO DE INFANTARIA DE SELVA", cityName: "Rio Branco", stateUf: "AC" },
  { sigla: "Cmdo Fron-RN/5º BIS", name: "COMANDO DE FRONTEIRA RIO NEGRO / 5º BATALHAO DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cmdo Fron-RO/6º BIS", name: "COMANDO DE FRONTEIRA DE RONDONIA / 6º BATALHAO DE INFANTARIA DE SELVA", cityName: "Guajará-Mirim", stateUf: "RO" },
  { sigla: "Cmdo Fron-RR/7º BIS", name: "COMANDO DE FRONTEIRA RORAIMA / 7º BATALHAO DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cmdo Fron-Sol/8º BIS", name: "COMANDO DE FRONTEIRA SOLIMOES E 8º BATALHAO DE INFANTARIA DE SELVA", cityName: "Tabatinga", stateUf: "AM" },
  { sigla: "Cmdo Fron-Juruá/61º BIS", name: "COMANDO DE FRONTEIRA JURUA/ 61º BATALHAO DE INFANTARIA DE SELVA", cityName: "Cruzeiro do Sul", stateUf: "AC" },
  { sigla: "Cmdo CMA", name: "COMANDO MILITAR DA AMAZÔNIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 2º Gpt E", name: "2º GRUPAMENTO DE ENGENHARIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 1ª Bda Inf SI", name: "COMANDO 1ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cmdo 2ª Bda Inf Sl", name: "2ª BRIGADA DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cmdo 16ª Bda Inf SI", name: "COMANDO 16ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "Cmdo 17ª Bda Inf SI", name: "COMANDO 17ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "4º BIM", name: "4º BATALHÃO DE INTELIGÊNCIA DO EXÉRCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 12ª RM", name: "12ª REGIÃO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CRO/12", name: "COMISSAO REGIONAL DE OBRAS DA 12ª REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C CMA", name: "COMPANHIA DE COMANDO DO COMANDO MILITAR DA AMAZONIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 2º Gpt E", name: "COMPANHIA DE COMANDO DO 2º GRUPAMENTO DE ENGENHARIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 1ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 1ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cia C 2ª Bda Inf Sl", name: "COMPANHIA DE COMANDO DA 2ª BRIGADA DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cia C 17ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 17ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "Cia C 12ª RM", name: "COMPANHIA DE COMANDO DA 12ª REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 16ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 16ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "17ª Cia Inf Sl", name: "17ª COMPANHIA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "3ª Cia F Esp", name: "3ª COMPANHIA DE FORCAS ESPECIAIS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "21ª Cia E Cnst", name: "21ª COMPANHIA DE ENGENHARIA DE CONSTRUCAO", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "4º CGEO", name: "4º CENTRO DE GEOINFORMACAO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "18° R C Mec", name: "18º REGIMENTO DE CAVALARIA MECANIZADO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "10º GAC Sl", name: "10º GRUPO DE ARTILHARIA DE CAMPANHA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "HMAM", name: "HOSPITAL MILITAR DE AREA DE MANAUS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "H Gu Porto Velho", name: "HOSPITAL DE GUARNICAO DE PORTO VELHO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "H Gu Tabatinga", name: "HOSPITAL DE GUARNICAO DE TABATINGA", cityName: "Tabatinga", stateUf: "AM" },
  { sigla: "H Gu São Gabriel Cachoeira", name: "HOSPITAL DE GUARNICAO DE SAO GABRIEL DA CACHOEIRA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "12º CGCFEx", name: "12º CENTRO DE GESTÃO CONTABILIDADE E FINANÇAS DO EXÉRCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Pq R Mnt/12", name: "PARQUE REGIONAL DE MANUTENCAO DA 12º REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "1º Pel Com Sl", name: "1º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "16º Pel Com Sl", name: "16º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "17º Pel Com Sl", name: "17º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "2º Pel Com Sl", name: "2º PELOTAO DE COMUNICACOES DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "17º Pel PE", name: "17º PELOTAO DE POLICIA DO EXERCITO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "32º Pel PE", name: "32º PELOTAO DE POLICIA DO EXERCITO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "34º Pel PE", name: "34º PELOTAO DE POLICIA DO EXERCITO", cityName: "Tefé", stateUf: "AM" },
  { sigla: "22º Pel PE", name: "22º PELOTAO DE POLICIA DO EXERCITO", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "18º RC Mec", name: "18º Regimento de Cavalaria Mecanizado", cityName: "Boa Vista", stateUf: "RR" },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(adminUser.password, 10);

  await prisma.user.upsert({
    where: { email: adminUser.email },
    update: {
      name: adminUser.name,
      role: adminUser.role,
      active: true,
      rank: adminUser.rank,
      cpf: adminUser.cpf,
    },
    create: {
      name: adminUser.name,
      email: adminUser.email,
      passwordHash,
      role: adminUser.role,
      active: true,
      rank: adminUser.rank,
      cpf: adminUser.cpf,
    },
  });

  for (const om of oms) {
    await prisma.militaryOrganization.upsert({
      where: { sigla: om.sigla },
      update: {
        name: om.name,
        cityName: om.cityName,
        stateUf: om.stateUf,
        isActive: true,
      },
      create: {
        sigla: om.sigla,
        name: om.name,
        cityName: om.cityName,
        stateUf: om.stateUf,
        isActive: true,
      },
    });
  }

  console.log("✅ Seed concluído: admin + OMs processadas.");
}

main()
  .catch((error) => {
    console.error("❌ Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });