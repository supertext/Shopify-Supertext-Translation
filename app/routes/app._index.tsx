import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { recentJobs, startJob, type JobView } from "../jobs.server";
import { effectiveApiKey, getSettings } from "../settings.server";
import { titleOf } from "../translation/fields.server";
import { resolvedTarget } from "../translation/language-codes";
import { reporting } from "../reporting/index.server";
import { listResources, shopLocales } from "../translation/shopify.server";
import { isResourceType, RESOURCE_TYPES } from "../translation/resource-types";
import type { MessageKey } from "../i18n";
import { ApiKeyHelp, rich, useI18n } from "../i18n/react";
import { TranslationFiles } from "../components/TranslationFiles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type = isResourceType(typeParam) ? typeParam : "PRODUCT";
  const after = url.searchParams.get("after");

  const [locales, page, jobs, settings] = await Promise.all([
    shopLocales(admin),
    listResources(admin, type, after),
    recentJobs(session.shop),
    getSettings(session.shop),
  ]);
  const primary = locales.find((l) => l.primary);
  // Notices app/Shopify updates and a changed key; never delays the page.
  reporting.onRequestInBackground(session.shop);

  return {
    type,
    primary: primary ? { locale: primary.locale, name: primary.name } : null,
    targets: locales
      .filter((l) => !l.primary)
      .map((l) => ({
        locale: l.locale,
        name: l.name,
        published: l.published,
        // null: no mapping, exact code or default (it can't be translated until chosen in Settings).
        code: resolvedTarget(l.locale, settings.languageCodes),
      })),
    resources: page.resources.map((r) => ({
      id: r.id,
      title: titleOf(r.content),
    })),
    nextCursor: page.hasNextPage ? page.endCursor : null,
    jobs,
    hasApiKey: effectiveApiKey(settings) !== "",
  };
};

/** A message key, so the page shows the error in the merchant's language. */
const failure = (error: MessageKey): { error: MessageKey } => ({ error });

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const resourceIds = form.getAll("resource").map(String).filter(Boolean);
  const locales = form.getAll("locale").map(String).filter(Boolean);
  if (resourceIds.length === 0 || locales.length === 0) {
    return failure("translate.selectSomething");
  }
  const settings = await getSettings(session.shop);
  if (!effectiveApiKey(settings)) {
    return failure("translate.noApiKey");
  }
  const jobId = await startJob(session.shop, {
    resourceIds,
    locales,
    overwrite: form.get("overwrite") === "on",
  });
  return { jobId } as { jobId: string };
};

const isActive = (job: JobView) => job.status === "queued" || job.status === "running";

export default function Translate() {
  const i18n = useI18n();
  const { t } = i18n;
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const submitting = navigation.state === "submitting";
  const running = data.jobs.some(isActive);

  // Refresh the job list while a translation runs.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 2000);
    return () => clearInterval(timer);
  }, [running, revalidator]);

  // Only the items on the current page are submitted, so start over on every page.
  // (Reset during render, not in an effect: React's "adjust state when a prop changes" pattern.)
  const pageKey = searchParams.toString();
  const [selectionPage, setSelectionPage] = useState(pageKey);
  if (selectionPage !== pageKey) {
    setSelectionPage(pageKey);
    setSelected(new Set());
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected =
    data.resources.length > 0 && data.resources.every((r) => selected.has(r.id));

  return (
    <s-page heading={t("translate.heading")}>
      <s-stack direction="inline" gap="small-200">
        <s-link href="/app/settings">{t("translate.settingsLink")}</s-link>
      </s-stack>
      {result && "error" in result && (
        <s-banner tone="critical">
          <s-paragraph>{t(result.error)}</s-paragraph>
        </s-banner>
      )}
      {result && "jobId" in result && (
        <s-banner tone="success">
          <s-paragraph>{t("translate.started")}</s-paragraph>
        </s-banner>
      )}
      {!data.hasApiKey && (
        <s-banner tone="warning" heading={t("translate.noKey.heading")}>
          <s-paragraph>
            {rich(i18n, "translate.noKey.text", {
              settings: <s-link href="/app/settings">{t("translate.noKey.settings")}</s-link>,
            })}
          </s-paragraph>
          <s-paragraph>
            <ApiKeyHelp />
          </s-paragraph>
        </s-banner>
      )}
      {data.targets.length === 0 && (
        <s-banner tone="info" heading={t("translate.oneLanguage.heading")}>
          <s-paragraph>{t("translate.oneLanguage.text")}</s-paragraph>
        </s-banner>
      )}

      <Form method="post">
        <s-section heading={t("translate.step1")}>
          <s-stack direction="inline" gap="small-200">
            {RESOURCE_TYPES.map((type) => (
              <s-button
                key={type.value}
                variant={type.value === data.type ? "primary" : "secondary"}
                onClick={() => setSearchParams({ type: type.value })}
              >
                {t(`resource.${type.value}`)}
              </s-button>
            ))}
          </s-stack>

          {data.resources.length === 0 ? (
            <s-paragraph>{t("translate.empty")}</s-paragraph>
          ) : (
            <div style={{ marginTop: 12 }}>
              <label style={rowStyle}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected ? new Set() : new Set(data.resources.map((r) => r.id)),
                    )
                  }
                />
                <strong>{t("translate.selectAll", { count: data.resources.length })}</strong>
              </label>
              {data.resources.map((r) => (
                <label key={r.id} style={rowStyle}>
                  <input
                    type="checkbox"
                    name="resource"
                    value={r.id}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  {r.title}
                </label>
              ))}
            </div>
          )}
          {(data.nextCursor || searchParams.get("after")) && (
            <s-stack direction="inline" gap="small-200">
              {searchParams.get("after") && (
                <s-button onClick={() => setSearchParams({ type: data.type })}>
                  {t("translate.firstPage")}
                </s-button>
              )}
              {data.nextCursor && (
                <s-button
                  onClick={() =>
                    setSearchParams({ type: data.type, after: data.nextCursor! })
                  }
                >
                  {t("translate.nextPage")}
                </s-button>
              )}
            </s-stack>
          )}
        </s-section>

        <s-section heading={t("translate.step2")}>
          <s-paragraph>
            {rich(i18n, "translate.codesHint", {
              settings: <s-link href="/app/settings">{t("translate.codesHint.settings")}</s-link>,
            })}
          </s-paragraph>
          {data.primary && (
            <s-paragraph>
              {rich(i18n, "translate.from", {
                language: <strong>{data.primary.name}</strong>,
              })}
            </s-paragraph>
          )}
          {data.targets.map((l) => (
            <label key={l.locale} style={rowStyle}>
              <input
                type="checkbox"
                name="locale"
                value={l.locale}
                defaultChecked={l.code !== null}
                disabled={l.code === null}
              />
              {l.name} ({l.locale}){" "}
              {l.code !== null ? (
                <span style={{ color: "#6d7175" }}>→ Supertext {l.code}</span>
              ) : (
                <span style={{ color: "#8e1f0b" }}>
                  {rich(i18n, "translate.unmapped", {
                    settings: (
                      <s-link href="/app/settings">{t("translate.codesHint.settings")}</s-link>
                    ),
                  })}
                </span>
              )}
              {!l.published && <em style={{ color: "#6d7175" }}>{t("translate.notPublished")}</em>}
            </label>
          ))}
          <label style={{ ...rowStyle, marginTop: 8 }}>
            <input type="checkbox" name="overwrite" />
            {t("translate.overwrite")}
          </label>
          <s-paragraph>{t("translate.overwriteHint")}</s-paragraph>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="base">
            <button
              type="submit"
              disabled={submitting || selected.size === 0 || data.targets.length === 0}
              style={buttonStyle}
            >
              {submitting
                ? t("translate.starting")
                : selected.size
                  ? i18n.tn("translate.submitCount", selected.size)
                  : t("translate.submit")}
            </button>
          </s-stack>
        </s-section>
      </Form>

      {data.targets.length > 0 && (
        <TranslationFiles selected={[...selected]} targets={data.targets} />
      )}

      <s-section heading={t("jobs.heading")}>
        {data.jobs.length === 0 ? (
          <s-paragraph>{t("jobs.none")}</s-paragraph>
        ) : (
          data.jobs.map((job) => <JobRow key={job.id} job={job} />)
        )}
      </s-section>
    </s-page>
  );
}

function JobRow({ job }: { job: JobView }) {
  const i18n = useI18n();
  const { t } = i18n;
  const label = isActive(job)
    ? t("job.running", { completed: job.completed, total: job.total })
    : job.status === "failed"
      ? t("job.failed")
      : job.errors.length
        ? t("job.doneWithErrors")
        : t("job.done");
  return (
    <s-box padding="small" borderWidth="base" borderRadius="base">
      <s-paragraph>
        <strong>{label}</strong> · {new Date(job.createdAt).toLocaleString(i18n.locale)} ·{" "}
        {job.locales.join(", ")} · {i18n.tn("job.written", job.written)}
        {job.skipped ? `, ${t("job.kept", { count: job.skipped })}` : ""}
      </s-paragraph>
      {job.errors.slice(0, 5).map((e, i) => (
        <s-paragraph key={i}>
          <s-text tone="critical">
            {e.locale ? `${e.locale}: ` : ""}
            {i18n.error(e)}
          </s-text>
        </s-paragraph>
      ))}
    </s-box>
  );
}

const rowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "6px 0",
  cursor: "pointer",
} as const;

const buttonStyle = {
  background: "#303030",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "8px 14px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
} as const;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
