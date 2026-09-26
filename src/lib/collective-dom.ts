/**
 * Verified Collective.work Sherlock DOM selectors.
 * Source: collective_work_sherlock_dom_selectors.md (live capture).
 * Do not use hashed css-* classes or auto-generated ids (field-«r…»).
 */

export const COLLECTIVE_URL = {
  search: "https://app.collective.work/recruiter/sherlock/search",
} as const;

export const DOM = {
  /** A1 — Sherlock brief */
  searchBox: 'form textarea[name="description"]',
  searchBoxBackup: 'textarea[placeholder^="Describe the profile"]',
  /** A2 — Search submit (disabled while empty) */
  searchSubmit: 'form button[type="submit"][aria-label="Search"]',
  searchSubmitBackup: 'button[aria-label="Search"]',

  /** B — virtualized results */
  scrollContainer: "#scrollableDiv",
  resultList: "#result-list",
  /** One virtualized card row */
  resultCard: "#result-list > div[data-index]",
  cardGroup: 'div[role="group"]',
  contactButton: 'button[data-dd-id="contact-button"]',
  avatarImg: 'img[alt]',

  /** C — Contact menu (scope to expanded button sibling) */
  contactOpen: 'button[data-dd-id="contact-button"][aria-expanded="true"]',
  dmInApp:
    'button[data-dd-id="contact-button"][aria-expanded="true"] + div button[data-type="IN_APP"]',
  dmInAppBackup: '[role="menu"] button[data-type="IN_APP"]',

  /** D — Send a message modal */
  modal: 'section[role="dialog"][aria-modal="true"]',
  channelPicker: 'section[aria-modal="true"] [aria-haspopup="menu"]',
  channelMenuItem: 'section[aria-modal="true"] [role="menuitem"]',
  messageBox: 'section[aria-modal="true"] textarea[name="content"]',
  messageBoxBackup: 'section[aria-modal="true"] textarea[placeholder="Send message..."]',
  sendButton: 'section[aria-modal="true"] form button[type="submit"]',
  modalClose: 'section[aria-modal="true"] button[aria-label="Close"]',
} as const;

/** Results ready when URL has a search id and the list mounts. */
export function isResultsUrl(url: string): boolean {
  return /\/recruiter\/sherlock\/search\/[^/?#]+/.test(url);
}
