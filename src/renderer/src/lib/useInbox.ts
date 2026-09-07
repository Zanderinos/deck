import { useEffect, useState } from "react";
import type { PrInbox } from "../../../main/prInbox.js";

/** The PR inbox, kept in sync via inbox:changed pushes. */
export function usePrInbox(): PrInbox | undefined {
  const [inbox, setInbox] = useState<PrInbox>();
  useEffect(() => {
    void window.deck.inbox.get().then(setInbox);
    return window.deck.inbox.onChanged(setInbox);
  }, []);
  return inbox;
}
