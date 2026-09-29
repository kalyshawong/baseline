import { CITATIONS, type CitationId } from "@/lib/citations";

/**
 * Inline source for an on-screen claim: "— Moore 2009, Trommelen 2023".
 * Each name links to the paper (opens in the browser / Safari on iOS).
 * Non-peer-reviewed sources (books, manuals, preprints) get a dagger (†).
 * Registry + verification notes: lib/citations.ts.
 */
export function Cite({ ids, dash = true }: { ids: CitationId[]; dash?: boolean }) {
  return (
    <span className="cite" style={{ textTransform: "none", letterSpacing: 0, whiteSpace: "normal" }}>
      {dash ? "— " : ""}
      {ids.map((id, i) => {
        const c = CITATIONS[id];
        return (
          <span key={id}>
            {i > 0 ? ", " : ""}
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              title={c.full}
              style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: "2px" }}
            >
              {c.short}
              {c.peerReviewed ? "" : "†"}
            </a>
          </span>
        );
      })}
    </span>
  );
}
