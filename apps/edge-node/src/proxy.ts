import net from "node:net";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { SessionRegistry } from "./sessions";

function tokenFromAuth(header?: string): string | null {
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  return decoded.split(":")[0] || null; // "<token>:"
}

export function handleConnect(req: IncomingMessage, clientSocket: Duplex, head: Buffer, registry: SessionRegistry) {
  const token = tokenFromAuth(req.headers["proxy-authorization"]);
  const session = token ? registry.getByToken(token) : undefined;
  if (!session || !registry.canProxy(session.id)) {
    clientSocket.write("HTTP/1.1 402 Payment Required\r\n\r\n");
    clientSocket.end();
    return;
  }
  const [host, portStr] = (req.url ?? "").split(":");
  const port = Number(portStr) || 443;

  const upstream = net.connect(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) { upstream.write(head); registry.addBytes(session.id, head.length); }
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  // Meter both directions (request bytes out + response bytes in).
  clientSocket.on("data", (d: Buffer) => registry.addBytes(session.id, d.length));
  upstream.on("data", (d: Buffer) => registry.addBytes(session.id, d.length));

  const close = () => { upstream.destroy(); clientSocket.destroy(); };
  clientSocket.on("error", close);
  upstream.on("error", close);
  clientSocket.on("close", () => upstream.end());
  upstream.on("close", () => clientSocket.end());
}
