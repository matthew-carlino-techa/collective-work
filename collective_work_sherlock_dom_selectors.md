# Collective.work (Sherlock) – DOM Selector Reference

Captured from the live page at `https://app.collective.work/recruiter/sherlock/search` (logged-in recruiter space).
Four states were captured: **A) Search landing**, **B) Results list**, **C) Contact menu open**, **D) "Send a message" modal open**.

Notation in sample HTML: classes and inline styles stripped, `=` written as `→`.
Anything marked `uncertain` was inferred, not verified by interaction. Nothing was clicked by the capture agent except where the user did so between captures.

---

## 0. General notes

- Framework: React + Chakra UI. CSS classes are hashed (`css-*`) and were **not** used anywhere below.
- Auto-generated ids (`field-«r27»`, `menu-button-«r29»`, `chakra-modal-«r98»`, …) change on every mount. **Never use them.**
- Stable hooks that exist: `name`, `placeholder`, `aria-label`, `aria-haspopup`, `aria-expanded`, `aria-modal`, `role`, `type`, `data-dd-id`, `data-type`, `data-index`, `#result-list`, `#scrollableDiv`.
- Layout is responsive. At narrow widths the sidebar becomes a hamburger + bottom nav; at desktop width there is a left sidebar. Check viewport width before targeting nav elements.
- The tab title is always `Collective`. Use the URL path, the h1, or "N relevant profiles found" to detect state.
- The JS tool sometimes blocks large attribute dumps. Query small pieces.

### URL states

| State | Path |
|---|---|
| Search landing | `/recruiter/sherlock/search` |
| Results | `/recruiter/sherlock/search/<searchId>` (id is different per search) |

### Sidebar / nav (stable `data-dd-id`, all `<a target="_self">`)

| Item | Selector |
|---|---|
| Sherlock | `a[data-dd-id="one-search-v2-menu"]` |
| MegaSearch | `a[data-dd-id="search-menu"]` |
| Searches & alerts | `a[data-dd-id="saved-search-menu"]` |
| Post a job | `a[data-dd-id="post-job-menu"]` |
| Jobs | `a[data-dd-id="jobs-menu"]` |
| Messages | `a[data-dd-id="chat-menu"]` |
| Lists | `a[data-dd-id="my-lists"]` |
| My talents ATS | `a[data-dd-id="import-users"]` |
| Network Search | `a[data-dd-id="my-connections"]` |
| User menu (bottom-left) | `[data-dd-id="sidebar-user-menu"]` (also `recruiter-profile`, `settings-menu`, `logout` inside a hidden dialog) |

### Non-blocking widgets

- `iframe#intercom-frame` (1×1), `.intercom-lightweight-app` (0×0), `.Frill_View`, `button#frill-recruiter-news` (aria-label "What's new").
- `#chakra-toast-manager-top` / `#chakra-toast-manager-bottom` (`pointer-events:none`).
- No cookie/consent banner was seen in any state.

---

## A. Search landing (`/recruiter/sherlock/search`)

### Selectors

| Step | Label | Selector | Backup | Notes |
|---|---|---|---|---|
| 1 | Sherlock description textarea | `form textarea[name="description"]` | `textarea[placeholder^="Describe the profile"]` | Unique. Enabled, visible, not in a modal. Autofocused. Inside `div[role=group]` inside the only `<form>`. Controlled React input. |
| 2 | Search / run button | `form button[type="submit"][aria-label="Search"]` | `button[aria-label="Search"]` | Icon-only (svg). **Disabled while textarea is empty.** |
| 2b | Search-mode dropdown ("Classic") | `form button[aria-haspopup="menu"]` | `xpath=//form//button[.//span[normalize-space()="Classic"]]` | Menu list renders in a `.chakra-portal`, hidden until opened. Items are `role=menuitemradio` with `value` LOW / MEDIUM / HIGH (MEDIUM checked). Item labels are empty in the DOM → mapping to names `uncertain`. |
| – | Tab "Research by need" | `a[href*="/recruiter/sherlock/se"]` | `xpath=//a[.//button[normalize-space()="Research by need"]]` | `<a>` wrapping a `<button type=button>`. Href truncated in capture. |
| – | Tab "Find similar profile" | `a[role="group"][href*="/recruiter/sherlock/lo"]` | `xpath=//a[.//p[normalize-space()="Find similar profile"]]` | Text is in a `<p>`. Href truncated → `uncertain`. |
| – | "Start new search" | `xpath=//button[normalize-space()="Start new search"]` | – | Disabled on landing. |
| – | "Filters" toggle | `xpath=//form//label[.//p[normalize-space()="Filters"]]` | `label:has(input[type=checkbox])` | Label wrapping a hidden, unnamed checkbox. Click the **label**. |
| – | "Check and modify my search criteria" | `xpath=//form//label[.//p[normalize-space()="Check and modify my search criteria"]]` | – | Same pattern. |
| – | Criteria chips (Job title, Location, Years of experience, Skills, Industry) | `xpath=//p[normalize-space()="Job title"]/parent::div` | – | Not inputs: `div > svg(circle) + p`. No role/attributes. Whether inside the form is `uncertain`. |
| – | Filters panel | (in DOM, collapsed) | – | `opacity:0; scale(0.9)` until toggled. Contains hidden checkboxes (`value=PERMANENT_CONTRACT/BOTH/FREELANCER`), 4× `[data-testid="chakra-range-slider-track"]`, range inputs with `data-form-type="other"`. |
| 3* | "Previous searches" card | `xpath=//p[normalize-space()="Next.js Developer"]/ancestor::div[3]` | JS: `p.parentElement.parentElement.parentElement` | Plain `div`, `cursor:pointer`, no href/attrs. Three cards share one parent. |
| 10 | Spinner | not found | – | No `role=progressbar`, `aria-busy`, or visible skeleton. |
| 11 | Cookie/consent | not found | – | – |

### Sample HTML

```html
<!-- search box -->
<textarea name→"description" placeholder→"Describe the profile you are looking for or put a job description..." id→"field-«r27»"></textarea>

<!-- search button (disabled when empty) -->
<button disabled→"" type→"submit" aria-label→"Search"><svg stroke→"currentColor" ... role→"img" aria-hidden→"true" ...
```

### Structure

```
form (only form on page)
└ div
  ├ div
  │ ├ div > div[role=group] > textarea[name=description]
  │ ├ div > button#menu-button-«…»[aria-haspopup=menu] ("Classic")
  │ │     + button[type=submit][aria-label=Search][disabled]
  │ └ div > div  (chips row: div>svg(circle)+p "Job title", "Location", …)
  └ div > div
      ├ label > input[checkbox] + "Filters" [New]
      └ label > input[checkbox] + "Check and modify my search criteria"
```

Previous-search card:

```
div[cursor:pointer]                 ← card (800×58)
├ div > div > svg + p "Next.js Developer"
└ div > div > (div, div)            ← meta: "Classic", "77 strong matches", "2 days ago"
```

---

## B. Results list (`/recruiter/sherlock/search/<id>`)

Header: h1 `Sherlock - <query>`, "Reasoning" box (e.g. "Sherlock performed 4 searches for you, analyzed 160 profiles, and found 135 relevant"), then "135 relevant profiles found".

### Selectors

| Step | Label | Selector | Backup | Notes |
|---|---|---|---|---|
| 1 | Search textarea | `form textarea[name="description"]` | `textarea[placeholder^="Describe the profile"]` | Still in DOM but scrolled off-screen. A second `<textarea readonly aria-readonly>` at 0×0 also exists (autosize mirror, `uncertain`) – always filter by `name="description"`. |
| 2 | Search submit | `form button[type="submit"][aria-label="Search"]` | `button[aria-label="Search"]` | Enabled once text exists. Off-screen after scroll. |
| 3 | **Result card** | `#result-list > div[data-index]` | `#result-list > div[data-index="0"]` | **Virtualized**: only ~6 of N cards are in the DOM at once; `data-index` is the position in the full list. Card body is `div[role="group"]`. |
| 3b | Scroll container | `#scrollableDiv` | – | `window` does not scroll; this inner div does. |
| 4 | Name | `#result-list > div[data-index="0"] div[role="group"] > div:nth-child(2) > div:first-child > div:nth-child(2) > div:first-child` | match by text | Plain `div`, `cursor:pointer`. Fragile structural selector; prefer text match. Headline is the following `<p>`. |
| 4b | Avatar | `#result-list > div[data-index="0"] img[alt="<Candidate Name>"]` | first `img` in the card | 48×48. `alt` = candidate name. Other imgs are 16×16 company logos. |
| 4c | Select checkbox | `#result-list > div[data-index="0"] label:has(input[type="checkbox"])` | – | Input is 1×1 hidden; click the label. |
| – | Add to list (heart) | `#result-list > div[data-index="0"] button[aria-label="Add this profile to your lists"]` | – | One per card. |
| – | Integrate | `#result-list > div[data-index="0"] button[aria-label="Integrate"]` | – | One per card. |
| 5 | **Contact** | `#result-list > div[data-index="0"] button[data-dd-id="contact-button"]` | `… button[aria-haspopup="menu"][aria-expanded]` | `<button type=button>`, text "Contact New", 193×32. Chevron is part of the same button. Exactly one per card. |
| – | "See how Sherlock thinks" | `xpath=//button[normalize-space()="See how Sherlock thinks"]` | – | – |
| – | "Show only available profiles" toggle | checkbox inside its label, `aria-disabled="true"` | – | Disabled in the captured account. |
| – | "Start new search" | `xpath=//button[normalize-space()="Start new search"]` | – | Enabled on results. |
| – | Bulk action bar | `#result-list + div` | – | `position:fixed` at bottom (1000×52): "0 selected", "Add to a list", `Bulk message` (button), `Export` (button). |
| 10 | Spinner | not found | – | Wait-for-done signals: URL path `/search/<id>`, text "N relevant profiles found", `#result-list` present. |
| 11 | Overlays | not found | – | – |

### Sample HTML

```html
<!-- Contact button (closed) -->
<button type→"button" data-dd-id→"contact-button" id→"menu-button-«r73»" aria-expanded→"false" aria-haspopup→"menu" aria-controls→"menu-list-«r73»"><span><svg/></span><span><span>Contact<span><span>New</span></span></span></span><span><svg/></span></button>

<!-- avatar -->
<span data-chromatic→"ignore" data-loaded→""><img alt→"Ankit Patil" src→"https://cdn.collective.work/profiles-assets-v2/…-profile-picture.png"></span>
```

### Card structure

```
div#scrollableDiv                          ← scroll container
└ div
  ├ div  "N relevant profiles found" · "Show only available profiles" · thumbs up/down
  ├ div#result-list                        ← virtualized, tens of thousands of px tall
  │  └ div[data-index=0..n]                ← one card
  │     └ div[role=group]
  │        ├ div > label > input[checkbox] (hidden) + span
  │        └ div
  │           ├ div (header row, 56px)
  │           │  ├ div > div > span > img[alt=<name>]   (avatar)
  │           │  ├ div > div "<Name>" + p "<headline>"
  │           │  └ div
  │           │     ├ button[aria-label="Add this profile to your lists"]
  │           │     ├ button[aria-label="Integrate"]
  │           │     └ div
  │           │        ├ button[data-dd-id=contact-button][aria-haspopup=menu]
  │           │        └ div > [role=menu] (hidden)
  │           │            ├ button[data-type=IN_APP]  "Send a direct message"
  │           │            ├ button[data-type=DIRECT_CONTACT_DETAILS] "Contact details"
  │           │            └ a[data-type=LINKEDIN][target=_blank] "Contact on LinkedIn"
  │           ├ div  "AI evaluation:" + match badge + reason text
  │           ├ div  chips (Salary / Daily rate, Availability, location, contract type)
  │           ├ div  "Skills" + tags
  │           └ div  "Last experiences" (company img[16×16] + role + dates)
  └ div[position:fixed]  "0 selected" | "Add to a list" | "Bulk message" | "Export"
```

---

## C. Contact menu open (on one card)

### Selectors

| Step | Label | Selector | Backup | Notes |
|---|---|---|---|---|
| 5 | Contact button (open) | `#result-list > div[data-index="N"] button[data-dd-id="contact-button"][aria-expanded="true"]` | `button[data-dd-id="contact-button"][data-active]` | Gets `aria-expanded="true"` and empty `data-active=""`. |
| 5b | Open menu | `button[data-dd-id="contact-button"][aria-expanded="true"] + div [role="menu"]` | `div[data-popper-placement="bottom-end"] > [role="menu"]` | `div[role=menu][aria-orientation=vertical][tabindex=-1]`, visible, 240×138, `z-index:1000`, holds focus. Exactly 1 match. |
| 6 | **Send a direct message** | `button[data-dd-id="contact-button"][aria-expanded="true"] + div button[data-type="IN_APP"]` | `#result-list > div[data-index="N"] [role="menu"] button[data-type="IN_APP"]` | `<button role=menuitem data-index=0 tabindex=-1>`, visible, enabled, 238×40. |
| – | Contact details | `… [role="menu"] button[data-type="DIRECT_CONTACT_DETAILS"]` | – | `data-index=1`. |
| – | Contact on LinkedIn | `… [role="menu"] a[data-type="LINKEDIN"]` | – | `<a data-index=2 target=_blank>` – opens a new tab, **not** the DM. |

### Sample HTML

```html
<!-- Contact button (open) -->
<button type→"button" data-dd-id→"contact-button" id→"menu-button-«r93»" aria-expanded→"true" aria-haspopup→"menu" aria-controls→"menu-list-«r93»" data-active→""><span><svg/></span><span><span>Contact<span><span>New</span></span></span></span><span><svg/>…

<!-- DM menu item -->
<button type→"button" data-type→"IN_APP" id→"menu-list-«r93»-menuitem-«r94»" role→"menuitem" tabindex→"-1" data-index→"0"><span><svg/></span><span>Send a direct message</span></button>
```

### Structure

```
div (header row)
└ div
   ├ button[data-dd-id=contact-button][aria-expanded=true][data-active]
   └ div[data-popper-placement=bottom-end]     ← mounted only while open, z-index 1000
      └ div[role=menu][aria-orientation=vertical][tabindex=-1]   ← focused
         ├ button[data-type=IN_APP][data-index=0]                "Send a direct message"
         ├ button[data-type=DIRECT_CONTACT_DETAILS][data-index=1] "Contact details"
         └ a[data-type=LINKEDIN][data-index=2][target=_blank]     "Contact on LinkedIn"
```

### Gotchas for this state

- Closed menus stay in the DOM with `visibility:hidden` (e.g. 9 `IN_APP` buttons for 9 cards, only 1 visible). Always scope to the `aria-expanded="true"` button's sibling.
- The `[data-popper-placement]` wrapper exists only for the open menu (1 in the document).
- The menu is inside the card, **not** in a portal (unlike the "Classic" dropdown and the modal).
- Only one Contact menu opens at a time.
- Popper may flip placement near the viewport bottom; select by attribute, not coordinates.

---

## D. "Send a message" modal open

### Selectors

| Step | Label | Selector | Backup | Notes |
|---|---|---|---|---|
| – | Modal root | `section[role="dialog"][aria-modal="true"]` | `[role="dialog"][aria-labelledby^="chakra-modal--header"]` | In `.chakra-portal` under `<body>`. 608×490. Only `aria-modal=true` node. |
| – | Title | `section[aria-modal="true"] header p` | – | "Send a message". |
| – | Close | `section[aria-modal="true"] button[aria-label="Close"]` | – | 24×24. |
| – | Recipient | `xpath=//section[@aria-modal="true"]//p[normalize-space()="<Name>"]` | – | Plain `<p>` beside a 24×24 avatar; no attributes → `uncertain`. |
| 7 | **Channel picker** | `section[aria-modal="true"] [aria-haspopup="menu"]` | `xpath=//section[@aria-modal="true"]//div[@aria-haspopup="menu"][.//p[normalize-space()="Choose a communication channel"]]` | **A `<div>`, not a `<button>`.** `aria-expanded="false"`, no role/tabindex. Placeholder "Choose a communication channel". |
| 7a | Option: Collective Chat | `section[aria-modal="true"] [role="menuitem"][data-index="0"]` | `xpath=//section[@aria-modal="true"]//button[@role="menuitem"][.//p[normalize-space()="Collective Chat"]]` | `<button role=menuitem>`; **`disabled`** for the captured candidate (reason `uncertain`). Menu is hidden until picker opens. |
| 7b | Option: Email | `… [role="menuitem"][data-index="1"]` | – | Text "Email New Connect". Enabled. |
| 7c | Option: WhatsApp | `… [role="menuitem"][data-index="2"]` | – | Text "WhatsApp New Connect". Enabled. |
| 8 | **Message composer** | `section[aria-modal="true"] textarea[name="content"]` | `textarea[placeholder="Send message..."]` | 566×132. `disabled:false` but **`readonly` + `aria-readonly="true"`** until a channel is selected (`uncertain` – not tested). Inside the modal `<form>`. |
| – | Emoji button | `section[aria-modal="true"] button[aria-label="reaction"]` | – | `type=button`, 32×24. |
| 9 | **Send** | `section[aria-modal="true"] form button[type="submit"]` | `xpath=//section[@aria-modal="true"]//button[@type="submit"][normalize-space()="Send"]` | `<button type=submit disabled>`, text "Send" + arrow icon, 95×32. **Disabled until channel selected/message entered** (`uncertain` which). |
| 10 | Spinner | not seen | – | Not scanned inside the modal → `uncertain`. |
| 11 | Blocking overlay | `.chakra-portal .chakra-modal__overlay` | – | Full-screen `div[aria-hidden=true]`. While open, `#root` has `aria-hidden="true"`. |

### Sample HTML

```html
<!-- message box -->
<textarea name→"content" placeholder→"Send message..." id→"field-«rk5»" readonly→"" aria-readonly→"true"></textarea>

<!-- Send -->
<button disabled→"" type→"submit">Send<span><svg/></span></button>

<!-- emoji -->
<button type→"button" aria-label→"reaction"><svg/></button>
```

### Structure

```
body
└ div.chakra-portal
   ├ div.chakra-modal__overlay[aria-hidden]           ← full-screen
   ├ div[data-focus-guard] … (focus guards)
   └ section[role=dialog][aria-modal=true][id=chakra-modal-«…»]
      ├ header
      │  └ div: p "Send a message"  +  button[aria-label=Close]
      └ div#chakra-modal--body-«…»
         └ div
            ├ p "Reach out through your preferred communication channel…"
            ├ div: avatar span + p "<candidate name>"
            ├ div
            │  ├ p "From"
            │  ├ div[aria-haspopup=menu][aria-expanded=false]   ← channel picker
            │  │    └ div>p "Choose a communication channel"  + chevron svg
            │  └ div (popper)
            │     └ div[role=menu] (hidden)
            │        ├ button[role=menuitem][data-index=0][disabled]  "Collective Chat"
            │        ├ button[role=menuitem][data-index=1]  "Email" [New] "Connect"
            │        └ button[role=menuitem][data-index=2]  "WhatsApp" [New] "Connect"
            └ form
               └ div[role=group]
                  ├ textarea[name=content][readonly]
                  ├ button[aria-label=reaction]              (emoji)
                  └ button[type=submit][disabled]  "Send →"
```

### Gotchas for this state

- **Send is disabled and the composer is read-only until a channel is chosen.** Wait for the state change; don't type straight away.
- **Collective Chat may be disabled** per candidate. Check `disabled` before clicking. Email/WhatsApp say "Connect" and may start an account-linking flow (untested).
- **The channel picker is a `div`.** `button[…]` and `role=button` queries will miss it.
- **Duplicate submit buttons:** the document has exactly two `button[type=submit]` – the page's `button[aria-label="Search"]` (enabled, under `#root`, `aria-hidden` while modal open) and the modal's "Send". Always scope to `section[aria-modal="true"]`.
- **Two `<form>`s** exist (page search form and modal form). Composer and Send share the modal form.
- **Portal scope / a11y tree:** while the modal is open `#root` is `aria-hidden`, so accessibility-tree tools may not see the page underneath. Plain `document.querySelector` works.
- **Ids regenerate every mount** – rely on `role`, `aria-modal`, `name`, `aria-label`, `type`, `data-index`.
- Menu items are `visibility:hidden` until the picker opens; their labels are in `<p>` (use `textContent`, not `innerText`, while hidden).
- Extra dialog-ish nodes to ignore: an empty hidden `section[role=dialog]` under `#root` and a hidden 333×2 `section[role=dialog]` in the portal (probably the emoji popover, `uncertain`). Filter by `aria-modal="true"`.

---

## E. Suggested end-to-end automation flow (untested, derived from the DOM above)

1. Open `/recruiter/sherlock/search`; wait for `form textarea[name="description"]`.
2. Set the textarea value via the native value setter + dispatch an `input` event (React-controlled), or type it; wait until `button[aria-label="Search"]` is enabled; click it.
3. Wait for URL path `/recruiter/sherlock/search/<id>`, then `#result-list > div[data-index="0"]` and the text "relevant profiles found".
4. For a card: `#result-list > div[data-index="N"] button[data-dd-id="contact-button"]` → click.
5. Wait for `button[data-dd-id="contact-button"][aria-expanded="true"] + div button[data-type="IN_APP"]` → click.
6. Wait for `section[role="dialog"][aria-modal="true"]`; verify the recipient name.
7. Click `section[aria-modal="true"] [aria-haspopup="menu"]`; pick a non-disabled `[role="menuitem"]` (Collective Chat if enabled).
8. Wait for `textarea[name="content"]` to lose `readonly`; enter the message.
9. Wait for `section[aria-modal="true"] form button[type="submit"]` to be enabled; **confirm with the user before clicking Send.**
10. Scroll `#scrollableDiv` to reach further cards; re-query by `data-index` after scrolling (virtualized list).

**Not captured yet:** the state after a channel is selected (composer/Send enabled), post-send confirmation/toast, and any Email/WhatsApp "Connect" flow.
