export class BoundedBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = "BoundedBodyError";
  }
}

export async function readBoundedBody(source: Request | Response, maxBytes: number): Promise<string> {
  const header = source.headers.get("content-length");
  if (header !== null) {
    if (!/^[0-9]+$/.test(header)) throw new BoundedBodyError("Invalid Content-Length", 400);
    const declared = Number(header);
    if (!Number.isSafeInteger(declared)) throw new BoundedBodyError("Invalid Content-Length", 400);
    if (declared > maxBytes) throw new BoundedBodyError("Body too large", 413);
  }
  if (!source.body) return "";

  const reader = source.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new BoundedBodyError("Body too large", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
