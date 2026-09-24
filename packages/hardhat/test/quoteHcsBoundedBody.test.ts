import { expect } from "chai";
import { BoundedBodyError, readBoundedBody } from "../../nextjs/utils/boundedBody";
import { readBoundedJson } from "../../nextjs/utils/quoteHcs";

describe("HCS bounded body reader", function () {
  it("rejects non-numeric and oversized declared lengths before reading", async function () {
    for (const [header, status] of [
      ["many", 400],
      ["9", 413],
    ] as const) {
      let reads = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull() {
            reads++;
          },
        },
        { highWaterMark: 0 },
      );
      const response = new Response(stream, { headers: { "content-length": header } });
      try {
        await readBoundedBody(response, 8);
        expect.fail("Expected a bounded-body rejection");
      } catch (error) {
        expect(error).to.be.instanceOf(BoundedBodyError);
        expect((error as BoundedBodyError).status).to.equal(status);
      }
      expect(reads).to.equal(0);
    }
  });

  it("stops a streamed body at the byte cap without a declared length", async function () {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(5));
        },
      },
      { highWaterMark: 0 },
    );
    const response = new Response(stream);
    try {
      await readBoundedBody(response, 8);
      expect.fail("Expected the stream to be stopped at the cap");
    } catch (error) {
      expect(error).to.be.instanceOf(BoundedBodyError);
      expect((error as BoundedBodyError).status).to.equal(413);
    }
    expect(pulls).to.be.lessThan(5);
  });

  it("uses the same bound for remote JSON", async function () {
    const body = JSON.stringify({ result: "ok" });
    const response = new Response(body, { headers: { "content-length": String(Buffer.byteLength(body)) } });
    expect(await readBoundedJson(response)).to.deep.equal({ result: "ok" });
    expect(await readBoundedJson(new Response(body))).to.deep.equal({ result: "ok" });
  });
});
