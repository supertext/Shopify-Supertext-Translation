import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { errorInfo, LocalizedError } from "../i18n/error";
import { importFile, refuseLargeUpload } from "../translation/files.server";
import { shopLocales } from "../translation/shopify.server";

// POST /app/files/import (resource route, called with fetch from the translate page):
// one uploaded XLIFF or HTML file → its translations written to Shopify, a summary per job.
// The upload is parsed in memory and never stored.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    // Refuse large uploads before reading them.
    refuseLargeUpload(request.headers.get("content-length"));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new LocalizedError("Choose a file.", "fileChoose");
    }
    refuseLargeUpload(null, file);
    const locales = (await shopLocales(admin)).filter((l) => !l.primary).map((l) => l.locale);
    const summaries = await importFile(admin, await file.text(), {
      includeChanged: form.get("includeChanged") === "on",
      overwrite: form.get("overwrite") === "on",
      locales,
    });
    return Response.json({ summaries });
  } catch (error) {
    return Response.json({ error: errorInfo(error) }, { status: 400 });
  }
};
