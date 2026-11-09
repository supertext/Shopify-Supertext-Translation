import { describe, expect, it } from "vitest";
import { createClients, REVIEW_URL, reviewUrl } from "../app/supertext/client.server";
import { prefixSegments } from "./fake-supertext";

/** A Supertext API (and review service) in memory on any host; records method, host and User-Agent. */
function fakeApi() {
  const calls: { method: string; host: string; path: string; userAgent: string; auth: string }[] = [];
  const files = new Map<string, string>();
  const fetch = async (url: string, init: RequestInit) => {
    const { host, pathname } = new URL(url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    calls.push({
      method,
      host,
      path: pathname,
      userAgent: headers.get("user-agent") ?? "",
      auth: headers.get("authorization") ?? "",
    });
    if (method === "POST") {
      const body = new TextDecoder().decode(init.body as ArrayBuffer);
      const target = body.match(/name="target_lang"\r\n\r\n([^\r]*)/)?.[1] ?? "";
      const html = body.slice(body.indexOf("<!DOCTYPE html>"), body.lastIndexOf("</html>") + 7);
      const id = `f${files.size + 1}`;
      files.set(id, prefixSegments(html, target));
      return Response.json({ file_id: id });
    }
    const id = pathname.split("/")[5] ?? "";
    if (pathname.endsWith("/status")) return Response.json({ status: "done" });
    if (pathname.endsWith("/translation")) return new Response(files.get(id) ?? "");
    return Response.json({});
  };
  return { calls, fetch };
}

const options = (fetch: ReturnType<typeof fakeApi>["fetch"], reviewUrl?: string) => ({
  apiKey: "test-key",
  baseUrl: "https://api.test/v1/",
  userAgent: "Shopify-Supertext-Translation/1.2.3",
  fetch,
  pollIntervalMs: 0,
  sleep: async () => undefined,
  ...(reviewUrl !== undefined ? { reviewUrl } : {}),
});

const texts = () => new Map([["0", { text: "Hello" }]]);

describe("Translation review", () => {
  it("sends a review language through the review service (upload, status, download, delete) and others directly", async () => {
    const api = fakeApi();
    const clients = createClients(options(api.fetch, "https://review.test/v1/"));

    const reviewed = await clients.forReview(true).translateTexts(texts(), "de-DE");
    expect(reviewed.get("0")).toBe("[de-DE] Hello");
    const direct = await clients.forReview(false).translateTexts(texts(), "fr-FR");
    expect(direct.get("0")).toBe("[fr-FR] Hello");

    const byHost = (host: string) => api.calls.filter((c) => c.host === host).map((c) => c.method);
    expect(byHost("review.test")).toEqual(["POST", "GET", "GET", "DELETE"]);
    expect(byHost("api.test")).toEqual(["POST", "GET", "GET", "DELETE"]);
    // Same key and User-Agent (with the app's version) for both.
    for (const call of api.calls) {
      expect(call.auth).toBe("Supertext-Auth-Key test-key");
      expect(call.userAgent).toContain("Shopify-Supertext-Translation/1.2.3");
    }
  });

  it("creates one review client and keeps the direct one for everything else", () => {
    const clients = createClients(options(fakeApi().fetch, "https://review.test/v1/"));
    expect(clients.forReview(false)).toBe(clients.direct);
    expect(clients.forReview(true)).not.toBe(clients.direct);
    expect(clients.forReview(true)).toBe(clients.forReview(true));
  });

  it("is off with an empty review URL or the API's own URL", () => {
    const off = createClients(options(fakeApi().fetch, ""));
    expect(off.forReview(true)).toBe(off.direct);
    const same = createClients(options(fakeApi().fetch, "https://api.test/v1"));
    expect(same.forReview(true)).toBe(same.direct);
  });

  it("uses Supertext's review service by default; SUPERTEXT_REVIEW_URL overrides it, empty turns it off", async () => {
    expect(reviewUrl({})).toBe(REVIEW_URL);
    expect(REVIEW_URL).toBe("https://localizationreview-production.up.railway.app/v1/");
    expect(reviewUrl({ SUPERTEXT_REVIEW_URL: " http://localhost:3000/v1/ " })).toBe("http://localhost:3000/v1/");
    expect(reviewUrl({ SUPERTEXT_REVIEW_URL: "" })).toBe("");

    const api = fakeApi();
    await createClients(options(api.fetch, reviewUrl({}))).forReview(true).translateTexts(texts(), "de-DE");
    expect(api.calls[0].host).toBe("localizationreview-production.up.railway.app");
  });
});
