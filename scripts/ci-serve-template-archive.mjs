import { createReadStream, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const [archivePath, portFile] = process.argv.slice(2);
const archiveSize = statSync(archivePath).size;
const route = "/repos/ref-dev22/quoteproof-template/tarball/main";

const server = createServer((request, response) => {
  if (request.url !== route || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/gzip", "content-length": archiveSize });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(archivePath).pipe(response);
});

server.listen(0, "127.0.0.1", () => {
  writeFileSync(portFile, String(server.address().port));
});
