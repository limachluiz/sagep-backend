# SAGEP Backend

Backend do **SAGEP** - Sistema de Apoio à Gestão de Projetos.

## Tecnologias
- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL
- Docker

## Funcionalidades atuais
- Autenticação com JWT
- Controle de perfis
- Usuários
- Projetos
- Tarefas
- Membros de projeto
- ATAs
- Itens de ATA por região/localidade
- Estimativas de preço
- Fluxo documental do projeto
- Dashboard gerencial e financeiro

## Rodando o projeto

### 1. Instalar dependências
```bash
npm install

### 2. Variáveis de ambiente
Crie um arquivo .env com base neste exemplo:
PORT=3000
NODE_ENV=development

DATABASE_URL="postgresql://sagep:sagep123@localhost:5432/sagep?schema=public"

JWT_ACCESS_SECRET="Senha forte aqui"
JWT_REFRESH_SECRET="Senha forte aqui"

JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

### 3. Subir o banco com Docker
```bash
docker compose up -d

### 4. Rodar as migrations
```bash
npx prisma migrate dev
npx prisma generate

### 5. Rodar o seed
```bash
npm run seed

### 6. Iniciar o servidor
```bash
npm run dev

### 7. Testar a API no navegador ou no Insonia
http://localhost:3000/api/health
GET http://localhost:3000/api/health

### 8. Testar Login para receber o token
POST http://localhost:3000/api/auth/login
Content-Type: application/json

``` JSON

{
  "email": "admin@sagep.com",
  "password": "123456"
}

### O SAGEP foi pensado para atender o fluxo real da Divisão Técnica - Seção de Projetos:

Estimativa de preço
Aguardando Nota de Crédito
DIEx Requisitório
Aguardando Nota de Empenho
OS Liberada
Serviço em Execução
Analisando As-Built
Atestar NF
Serviço Concluído
