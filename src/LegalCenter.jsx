import React, { useEffect, useMemo, useState } from "react";
import { LEGAL_DOCUMENTS, LEGAL_VERSION, getLegalDocument } from "./legalContent.js";

export default function LegalCenter({ initialDoc = "mentions", onClose }) {
  const [activeId, setActiveId] = useState(initialDoc);
  const activeDocument = useMemo(() => getLegalDocument(activeId), [activeId]);

  useEffect(() => setActiveId(initialDoc || "mentions"), [initialDoc]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="pf-legal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="pf-legal-modal" role="dialog" aria-modal="true" aria-labelledby="pf-legal-title">
        <header className="pf-legal-head">
          <div>
            <div className="pf-legal-brand">POKER<span>FORGE</span></div>
            <h2 id="pf-legal-title">Centre juridique</h2>
            <p>Documents applicables et informations de transparence</p>
          </div>
          <button className="pf-legal-close" type="button" onClick={onClose} aria-label="Fermer le centre juridique">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>

        <div className="pf-legal-layout">
          <nav className="pf-legal-tabs" aria-label="Documents juridiques">
            {LEGAL_DOCUMENTS.map((document) => (
              <button
                key={document.id}
                type="button"
                className={`pf-legal-tab${activeId === document.id ? " active" : ""}`}
                onClick={() => setActiveId(document.id)}
              >
                <span>{document.shortTitle}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
              </button>
            ))}
            <div className="pf-legal-version">Version {LEGAL_VERSION}</div>
          </nav>

          <article className="pf-legal-body">
            <div className="pf-legal-document-head">
              <div>
                <h3>{activeDocument.title}</h3>
                <p>{activeDocument.summary}</p>
              </div>
              <span className="pf-legal-updated">Mis a jour le 28/06/2026</span>
            </div>

            {activeDocument.status && (
              <div className={`pf-legal-warning ${activeDocument.status}`} role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 4h.01M10.3 3.7L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.7a2 2 0 00-3.4 0z"/></svg>
                <div>
                  <strong>{activeDocument.statusLabel}</strong>
                  <span>Ce point doit etre renseigne et valide avant une publication commerciale.</span>
                </div>
              </div>
            )}

            <div className="pf-legal-sections">
              {activeDocument.sections.map((section) => (
                <section className="pf-legal-section" key={section.title}>
                  <h4>{section.title}</h4>
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                  )}
                </section>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
