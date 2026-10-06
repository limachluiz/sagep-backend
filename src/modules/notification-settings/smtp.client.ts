import net from "node:net";
import tls from "node:tls";
import { AppError } from "../../shared/app-error.js";

export type SmtpConnection = {
  host: string;
  port: number;
  secure: boolean;
  username?: string | null;
  password?: string | null;
};

type Socket = net.Socket | tls.TLSSocket;

class SmtpSession {
  private buffer = "";
  private responseBuffer = "";
  private pending: Array<{ resolve: (value: string) => void; reject: (error: Error) => void }> = [];

  constructor(private socket: Socket) { this.bind(socket); }

  private bind(socket: Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { this.buffer += String(chunk); this.flush(); });
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("Conexão SMTP encerrada")));
  }

  private flush() {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      this.responseBuffer += `${line}\n`;
      if (/^\d{3} /.test(line)) {
        const response = this.responseBuffer.trim();
        this.responseBuffer = "";
        this.pending.shift()?.resolve(response);
      }
    }
  }

  private fail(error: Error) { while (this.pending.length) this.pending.shift()!.reject(error); }

  response() { return new Promise<string>((resolve, reject) => this.pending.push({ resolve, reject })); }
  async command(command: string, expected: number[]) {
    const response = this.response();
    this.socket.write(`${command}\r\n`);
    const received = await response;
    const lastLine = received.split(/\r?\n/).at(-1) ?? "";
    const code = Number(lastLine.slice(0, 3));
    if (!expected.includes(code)) throw new AppError(`Servidor SMTP recusou a operação (${received.replace(/\s+/g, " ")})`, 502, "SMTP_COMMAND_REJECTED");
    return received;
  }
  raw(value: string) { this.socket.write(value); }
  replaceSocket(socket: Socket) { this.socket.removeAllListeners(); this.socket = socket; this.buffer = ""; this.responseBuffer = ""; this.bind(socket); }
  close() { this.socket.end(); }
}

async function openSocket(config: SmtpConnection) {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true })
    : net.connect({ host: config.host, port: config.port });
  socket.setTimeout(20_000, () => socket.destroy(new Error("Tempo limite da conexão SMTP excedido")));
  await new Promise<void>((resolve, reject) => {
    socket.once(config.secure ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
  });
  const session = new SmtpSession(socket);
  const greeting = await session.response();
  if (!greeting.startsWith("220")) throw new AppError("Servidor SMTP não apresentou uma saudação válida", 502, "SMTP_INVALID_GREETING");
  let capabilities = await session.command("EHLO sagep.local", [250]);
  if (!config.secure && /(?:^|\n)250[ -]STARTTLS\b/i.test(capabilities)) {
    await session.command("STARTTLS", [220]);
    const secureSocket = tls.connect({ socket, servername: config.host, rejectUnauthorized: true });
    await new Promise<void>((resolve, reject) => { secureSocket.once("secureConnect", resolve); secureSocket.once("error", reject); });
    session.replaceSocket(secureSocket);
    capabilities = await session.command("EHLO sagep.local", [250]);
  } else if (!config.secure && config.username) {
    session.close();
    throw new AppError("O servidor SMTP não ofereceu STARTTLS; as credenciais não serão enviadas sem criptografia", 422, "SMTP_TLS_REQUIRED");
  }
  if (config.username) {
    if (!config.password) throw new AppError("Informe a senha SMTP", 422, "SMTP_PASSWORD_REQUIRED");
    const token = Buffer.from(`\0${config.username}\0${config.password}`, "utf8").toString("base64");
    await session.command(`AUTH PLAIN ${token}`, [235]);
  }
  return session;
}

export async function verifySmtp(config: SmtpConnection) {
  const session = await openSocket(config);
  try { await session.command("QUIT", [221]); } finally { session.close(); }
}

function safeHeader(value: string) { return value.replace(/[\r\n]+/g, " ").trim(); }
function address(value: string) { return `<${safeHeader(value)}>`; }

export async function sendSmtpMessage(config: SmtpConnection, message: { fromName?: string | null; fromEmail: string; to: string[]; subject: string; text: string }) {
  const recipients = [...new Set(message.to.map((email) => email.trim().toLowerCase()))];
  if (!recipients.length) throw new AppError("Informe ao menos um destinatário", 422);
  const session = await openSocket(config);
  try {
    await session.command(`MAIL FROM:${address(message.fromEmail)}`, [250]);
    for (const recipient of recipients) await session.command(`RCPT TO:${address(recipient)}`, [250, 251]);
    await session.command("DATA", [354]);
    const from = message.fromName ? `${safeHeader(message.fromName)} ${address(message.fromEmail)}` : address(message.fromEmail);
    const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const response = session.response();
    session.raw([
      `From: ${from}`, `To: ${recipients.length === 1 ? address(recipients[0]!) : "Destinatários SAGEP <undisclosed-recipients:;>"}`, `Subject: ${safeHeader(message.subject)}`,
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit",
      `Date: ${new Date().toUTCString()}`, "", body, ".", "",
    ].join("\r\n"));
    const delivered = await response;
    if (!delivered.startsWith("250")) throw new AppError(`Servidor SMTP não aceitou a mensagem (${delivered})`, 502, "SMTP_DELIVERY_REJECTED");
    await session.command("QUIT", [221]);
  } finally { session.close(); }
}
