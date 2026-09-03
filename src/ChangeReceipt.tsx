import { useCallback, useEffect, useState } from "react";
import {
  authorLabel,
  fetchChanges,
  isStaleUndo,
  undoChange,
  undoable,
  whenLabel,
  type DashboardChange,
} from "./changes";
import type { DashboardConfig } from "./dashboard";

/**
 * »Varje ändring har ett kvitto med Ångra« — DESIGNBESLUT princip 6.
 *
 * Raden ligger under hero-meningen och över korten, för att det är där ögat
 * redan är när något ser annorlunda ut än i går. Den syns bara när det finns
 * något att säga: en startsida ingen rört bär ingen rad alls, och en tom ruta
 * som väntar på innehåll är sämre än ingen ruta.
 *
 * Spåret bakom raden är en läsning, inte en radering. Ångra skriver en ny
 * revision — den ångrade står kvar, märkt. Därför kan listan visa både vad som
 * hände och vad som togs tillbaka, och den som undrar behöver inte lita på sitt
 * minne.
 */
export function ChangeReceipt({ onUndone }: { onUndone: (config: DashboardConfig) => void }) {
  const [changes, setChanges] = useState<DashboardChange[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetchChanges().then(setChanges).catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const newest = changes[0];
  const canUndo = undoable(changes);

  async function undo() {
    setBusy(true);
    setNote("");
    try {
      onUndone(await undoChange());
      setChanges(await fetchChanges());
    } catch (error) {
      // 409 betyder att något annat hann ändras — en annan flik, eller Legend.
      // Det är inte ett fel att be användaren åtgärda; det är en läsning som
      // hunnit bli gammal. Ytan läser om och säger vad som hände, en gång.
      if (isStaleUndo(error)) {
        setNote("Något annat ändrades under tiden. Raden är uppdaterad.");
        setChanges(await fetchChanges().catch(() => changes));
      } else {
        setNote("Det gick inte att ångra just nu.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!newest) return null;

  return (
    <div className="receipt" role="status" aria-busy={busy || undefined}>
      <div className="receipt-row">
        <span className="receipt-summary">{newest.summary}</span>
        {/* Tidpunkten och Ångra hör ihop och bryter tillsammans: på en smal
            skärm ska knappen inte hamna ensam på en egen rad, långt från det
            den gäller. */}
        <span className="receipt-meta">
          {/* Vem som ändrade hör hemma på den nyaste raden framför alla andra:
              det är den en Legend-ändring producerar, och den en användare
              läser när sidan ser annorlunda ut än i går. Märket fanns bara i
              den utfällda listan, alltså överallt utom där det behövdes. */}
          <span className="receipt-when muted">
            {whenLabel(newest.changed_at)}
            {authorLabel(newest) && ` · ${authorLabel(newest)}`}
          </span>
          {canUndo && (
            <button className="quiet-button" onClick={undo} disabled={busy}>Ångra</button>
          )}
        </span>
      </div>

      {note && <p className="receipt-note muted">{note}</p>}

      {changes.length > 1 && (
        <button
          className="quiet-button receipt-more"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          {expanded ? "Dölj vad mer som ändrats" : "Vad mer har ändrats?"}
        </button>
      )}

      {expanded && (
        <ul className="receipt-trail">
          {changes.slice(1).map((change) => (
            <li key={change.revision} className={change.undone ? "undone" : undefined}>
              <span>{change.summary}</span>
              <span className="receipt-when muted">
                {whenLabel(change.changed_at)}
                {authorLabel(change) && ` · ${authorLabel(change)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
