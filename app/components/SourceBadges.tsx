import type { Citation } from "@/lib/types";

type Src = Pick<Citation, "sourceType" | "synthetic" | "starterNote">;

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
      {source.starterNote && (
        <span className="badge badge-starter" title="Paraphrased starter note – verify against the official source">Starter note · verify</span>
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
      <span className="badge badge-starter">Starter note · verify</span>
    </span>
  );
}
