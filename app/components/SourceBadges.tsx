import type { Citation } from "@/lib/types";

type Src = Pick<Citation, "sourceType" | "synthetic">;

export function SourceBadges({ source }: { source: Src }) {
  return (
    <>
      {source.sourceType === "public" ? (
        <span className="badge badge-public" title="Official or public authoritative material">Official / public</span>
      ) : (
        <span className="badge badge-firm" title="The firm's own internal workflow – not tax law">Internal firm</span>
      )}
      {source.synthetic && (
        <span className="badge badge-synthetic" title="Fictional content created for this demo">Synthetic demo</span>
      )}
    </>
  );
}

export function SourceLegend() {
  return (
    <span className="legend">
      Sources:
      <span className="badge badge-public">Official / public</span>
      <span className="badge badge-firm">Internal firm</span>
      <span className="badge badge-synthetic">Synthetic demo</span>
    </span>
  );
}

/** "https://www.gesetze-im-internet.de/ao_1977/__138.html" → "gesetze-im-internet.de" */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Display number for a ref: "S3" → "3". */
export const refNum = (ref: string) => ref.replace(/^S/, "");

/** Numbered source list: [n] title · category · link. */
export function SourceList({
  citations,
  active,
  onSelect,
}: {
  citations: Citation[];
  active?: string | null;
  onSelect?: (ref: string | null) => void;
}) {
  return (
    <div className="sources">
      {citations.map((c) => (
        <div key={c.ref} className={`source-row ${active === c.ref ? "active" : ""}`}>
          <button
            className={`cite cite-${c.sourceType}`}
            onClick={() => onSelect?.(active === c.ref ? null : c.ref)}
            title="Show the cited passage"
          >
            {refNum(c.ref)}
          </button>
          <div className="source-body">
            <div className="source-title">
              {c.title} <SourceBadges source={c} />
              {c.url && (
                <a className="source-link" href={c.url} target="_blank" rel="noreferrer">
                  {hostOf(c.url)} ↗
                </a>
              )}
            </div>
            {active === c.ref && (
              <div className="source-excerpt">
                <strong>{c.heading}</strong>
                {"\n"}
                {c.excerpt}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
