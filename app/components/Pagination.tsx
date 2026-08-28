import { AppButton } from "./AppButton";

type PaginationProps = {
  page: number;
  totalPages: number;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
};

function buildHref(basePath: string, page: number, extraParams?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({ page, totalPages, basePath, extraParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="app-pagination">
      {page <= 1 ? (
        <AppButton variant="secondary" disabled>Previous</AppButton>
      ) : (
        <AppButton href={buildHref(basePath, page - 1, extraParams)} variant="secondary">Previous</AppButton>
      )}
      <span className="app-pagination__label">
        Page {page} of {totalPages}
      </span>
      {page >= totalPages ? (
        <AppButton variant="secondary" disabled>Next</AppButton>
      ) : (
        <AppButton href={buildHref(basePath, page + 1, extraParams)} variant="secondary">Next</AppButton>
      )}
    </div>
  );
}
