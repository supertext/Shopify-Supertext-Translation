import prisma from "./db.server";
import { getSettings, supertextClients } from "./settings.server";
import { localizeError, SupertextError } from "./supertext/client.server";
import { politenessFor, supertextSource, supertextTarget } from "./translation/language-codes";
import { reporting } from "./reporting/index.server";
import { unauthenticated } from "./shopify.server";
import { shopLocales } from "./translation/shopify.server";
import type { TranslateTexts } from "./translation/translate.server";
import {
  processJob,
  type JobError,
  type JobRequest,
} from "./translation/process.server";
import { errorInfo } from "./i18n/error";

export type { JobError, JobRequest };

export interface JobView {
  id: string;
  status: string;
  total: number;
  completed: number;
  written: number;
  skipped: number;
  errors: JobError[];
  locales: string[];
  createdAt: string;
}

export async function recentJobs(shop: string, take = 5): Promise<JobView[]> {
  const rows = await prisma.translationJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    total: row.total,
    completed: row.completed,
    written: row.written,
    skipped: row.skipped,
    errors: JSON.parse(row.errors) as JobError[],
    locales: (JSON.parse(row.request) as JobRequest).locales,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Starts a translation in the background and returns its id. The work runs in
 * this process with the shop's offline session; the page polls the job row.
 */
export async function startJob(shop: string, request: JobRequest): Promise<string> {
  const job = await prisma.translationJob.create({
    data: {
      shop,
      request: JSON.stringify(request),
      total: request.resourceIds.length * request.locales.length,
    },
  });
  void runJob(job.id, shop, request).catch(async (error: Error) => {
    console.error(`[supertext] job ${job.id} failed: ${error.message}`);
    await prisma.translationJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          errors: JSON.stringify([{ resource: "", locale: "", ...errorInfo(error) }]),
        },
      })
      .catch(() => undefined);
  });
  return job.id;
}

async function runJob(id: string, shop: string, request: JobRequest): Promise<void> {
  const { admin } = await unauthenticated.admin(shop);
  const settings = await getSettings(shop);
  const clients = supertextClients(settings);
  const review = new Set(settings.reviewLocales);
  const primary = (await shopLocales(admin)).find((l) => l.primary)?.locale;
  let reportedAuthFailure = false;
  const translate: TranslateTexts = async (segments, locale) => {
    try {
      // The shop's mapping, else an exact Supertext code, else the SDK default (de → de-DE, …), else unsupported_language (nothing sent).
      const target = supertextTarget(locale, settings.languageCodes);
      const source = primary ? supertextSource(primary, settings.languageCodes) : null;
      // Languages with Translation review on go through the review service; translateTexts
      // uploads, polls, downloads and deletes with that one client.
      return await clients.forReview(review.has(locale)).translateTexts(segments, target, {
        sourceLang: source || null,
        politeness: politenessFor(settings.politeness, target),
      });
    } catch (error) {
      if (error instanceof SupertextError && error.code === "authentication_failure" && !reportedAuthFailure) {
        reportedAuthFailure = true;
        void reporting.authenticationFailed(shop, error.status ?? 401);
      }
      throw localizeError(error);
    }
  };

  await prisma.translationJob.update({ where: { id }, data: { status: "running" } });
  const result = await processJob(admin, translate, request, async (progress) => {
    await prisma.translationJob.update({
      where: { id },
      data: {
        completed: progress.completed,
        written: progress.written,
        skipped: progress.skipped,
        errors: JSON.stringify(progress.errors),
      },
    });
  });
  await prisma.translationJob.update({
    where: { id },
    data: {
      status: result.errors.length && result.written === 0 ? "failed" : "done",
    },
  });
  // Notices app, Shopify and runtime updates (and a changed key) after the work is done.
  if (!reportedAuthFailure) reporting.onRequestInBackground(shop);
}
