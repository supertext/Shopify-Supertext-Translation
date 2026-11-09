import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSettings } from "../settings.server";
import { errorInfo, LocalizedError } from "../i18n/error";
import { exportFile } from "../translation/files.server";
import { shopLocales } from "../translation/shopify.server";

// POST /app/files/export (resource route, called with fetch from the translate page):
// one resource, one or more target locales, format xliff|html → the file as a download.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const resourceIds = form.getAll("resource").map(String).filter(Boolean);
  const format = form.get("format") === "html" ? "html" : "xliff";
  try {
    if (resourceIds.length !== 1) {
      throw new LocalizedError("Select exactly one item to export.", "fileSelectOne");
    }
    const [locales, settings] = await Promise.all([shopLocales(admin), getSettings(session.shop)]);
    const primary = locales.find((l) => l.primary);
    const targets = new Set(locales.filter((l) => !l.primary).map((l) => l.locale));
    const file = await exportFile(admin, {
      resourceId: resourceIds[0],
      locales: form.getAll("locale").map(String).filter((l) => targets.has(l)),
      format,
      primaryLocale: primary?.locale ?? "en",
      mapping: settings.languageCodes,
    });
    return new Response(file.content, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: errorInfo(error) }, { status: 400 });
  }
};
