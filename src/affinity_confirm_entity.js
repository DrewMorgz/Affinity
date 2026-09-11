// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM WHICH ENTITY BEFORE WRITING TO IT
//
// Nineteen actions take an entity id typed into a prompt. Reading a figure
// against the wrong one is recoverable; WRITING to the wrong one is not always.
// Billing, posting a tax entry, transferring an asset, remediating a client
// money shortfall — every one of those takes a number somebody typed, and 3 is
// one keystroke from 13.
//
// The number carries no information a person can check. The NAME does. So
// before any of those writes happens, the id is resolved and the name shown
// back: "This will bill Meridian Holdings Ltd. Continue?"
//
// This is not a substitute for a proper entity picker, which is the right
// answer and a larger change. It is the difference between a typo being caught
// by the person who made it and being found later in the ledger.
// ─────────────────────────────────────────────────────────────────────────────
import { eaEntitiesList } from "./affinity_eadmin_api";

let cache = null;

async function entities() {
  if (cache) return cache;
  const r = await eaEntitiesList();
  cache = (r && r.ok && Array.isArray(r.data)) ? r.data : [];
  return cache;
}

/**
 * Resolve an id to a name and ask the person to confirm it.
 *
 * Returns the id when confirmed, or null when the person declines — so the
 * caller reads as: const id = await confirmEntity(raw, "bill"); if (!id) return;
 *
 * Where the id matches nothing, it REFUSES rather than asking. An id that
 * resolves to no entity is a typo by definition, and offering to proceed with
 * it would defeat the point.
 */
export async function confirmEntity(rawId, whatFor) {
  const id = Number(rawId);
  if (!id) return null;

  const list = await entities();
  const hit = list.find((e) => Number(e.id) === id);

  if (!hit) {
    window.alert(
      "There is no entity with id " + id + ", so nothing was done.\n\n" +
      "Check the id on the Entities list. An id that matches nothing is a " +
      "typo, and acting on it anyway is how the wrong client gets touched.");
    return null;
  }

  const ok = window.confirm(
    "This will " + (whatFor || "act") + ":\n\n" +
    "    " + (hit.name || "(unnamed)") + "\n" +
    "    " + [hit.ref, hit.jurisdiction, hit.entity_type].filter(Boolean).join(" · ") +
    (hit.is_demo ? "\n    DEMO DATA" : "") +
    "\n\nIs that the right one?");

  return ok ? id : null;
}

/** Drop the cached list — call after an entity is created or closed. */
export function forgetEntities() { cache = null; }
