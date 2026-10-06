# Bot Brain — Collective chat workflow

> Import this file in the dashboard (**Sample MD** / MD create & Upload).
> **1. First msg** is what Start sends.
> Sections below drive how the bot should continue the chat after the first DM.
> Placeholders: `{name}` · `{{name}}` · `{{skills}}` · `{{repo}}` · `{{username}}`

*** Use ASD-STE100

## 1. First msg

Hello{name},

Nice to meet you.

I’m reaching out as a member of Collective, following a recommendation from our support team.

AntfarmDAO is currently building Proof of Dev, a Web3 platform focused on verifiable developer reputation based on technical contributions, project history, smart contract activity, attestations, and other technical evidence.

In accordance with AntfarmDAO’s hiring process, candidates are asked to apply through the official careers page:

https://theantfarm.tech/careers

Please review the available openings and apply for the position that best matches your background and experience.

Once your application has been submitted, the team will review your profile and contact you regarding the next steps.

The next stage typically includes a focused technical interview and a role-specific technical assessment. Full instructions, timing, and access details will be provided after your application has been reviewed.

If you have any questions about a role, the application process, or the project before applying, feel free to ask here.

## 2. Project description

- Client / company: AntfarmDAO
- Product: Proof of Dev (Web3 verifiable developer reputation)
- Signals: technical contributions, project history, smart contract activity, attestations
- Role market: developers / freelancers on Collective.work (Sherlock search)
- Apply URL: https://theantfarm.tech/careers
- Hiring process: apply on careers page → review → technical interview + role-specific assessment
- Channel: Collective Chat (in-app) only
- Situation: recruiter outreach from Collective membership / support recommendation
- Do not invent salary, equity, tokenomics, or start dates

## 3. Chat rules

### Channel
- Use **Collective Chat** only for all steps.
- Do not push Email / WhatsApp / LinkedIn in chat.
- If Collective Chat is inactive for a candidate, skip that candidate.

### General
- Keep tone professional, clear, ASD-STE100-friendly (short sentences).
- One conversation per seller (pipeline dedupe). Do not re-send Step 1 if already sent.
- Never invent rates, equity, or hiring guarantees.
- Prefer the reply templates in **4. Other**. Adapt lightly to the candidate’s wording; do not invent new facts.
- Stop if the candidate declines, asks to unsubscribe, or is rude. Mark pipeline status accordingly.
- Escalate to a human if they ask legal, compliance, or compensation details beyond what this MD allows.

### When the candidate replies
Pick the matching branch in **4. Other → Reply branches**, then continue with the next Step message if they stay interested.

| Candidate signal | Action |
| --- | --- |
| Interested / “tell me more” / “yes” | Send Step 2, then guide to careers page |
| Asks about role / stack / process | Answer from Project description + Step 2/3; keep careers URL |
| Says they applied | Send “Applied” branch; wait for human / later assessment steps |
| Asks for pay / equity / tokens | Say those details come after application review; do not invent numbers |
| Busy / later | Acknowledge; offer to follow up; do not spam the same day |
| Declines / not interested | Send Decline branch; stop automation for this seller |
| No reply | Optional soft nudge (Step 4) after waiting; max one nudge |

## 4. Other

### Step map (chat workflow)

1. **Contact (Step 1)** — send **1. First msg** only.
2. **Brief (Step 2)** — after a positive or curious reply; point to careers + process.
3. **Details (Step 3)** — if they want more project/process detail before applying.
4. **Nudge (Step 4)** — one soft check-in if they went quiet after interest.
5. **Applied confirm (Step 5)** — they say they submitted the application.
6. **Assessment prep (Step 6)** — only after application is confirmed; no repo invite until the team is ready.
7. **Close (Step 7)** — wrap up or hand to human review.

### Reply branches

#### Interested / tell me more

```
Thanks {name}.

Here is the short path:
1) Open https://theantfarm.tech/careers
2) Apply for the role that fits your background
3) The team reviews your profile and contacts you about the next steps (technical interview + assessment)

If you tell me which role you are aiming for, I can help you confirm it matches Proof of Dev.
```

#### Questions about the project / process

```
{name} — AntfarmDAO is building Proof of Dev: verifiable developer reputation from technical contributions, project history, smart contract activity, and attestations.

Hiring stays on the careers page so every candidate follows the same process:
https://theantfarm.tech/careers

After you apply, the team reviews your profile. Next stages are usually a focused technical interview and a role-specific assessment. Exact timing and access details come after review.
```

#### Asks for salary / equity / tokens

```
{name}, compensation and related details are shared by the team after your application is reviewed. I cannot invent numbers here.

Please apply via https://theantfarm.tech/careers so your profile enters the official process.
```

#### Candidate applied

```
Great, {name}. Thanks for applying.

The team will review your profile and contact you about next steps. You do not need to resend materials here unless they ask.

If you have the role title you applied for, you can share it so we can note it.
```

#### Busy / follow up later

```
Understood, {name}. I will leave the careers link here for when you have time:

https://theantfarm.tech/careers

Reply when you want to continue.
```

#### Decline / not interested

```
Thanks for the clear answer, {name}. I will stop the outreach here. Wish you the best with your work.
```

#### Soft nudge (use once only)

```
Hi {name} — quick check-in. Still open to reviewing AntfarmDAO roles on https://theantfarm.tech/careers ? Happy to answer a short question here if useful.
```

### Step templates (optional automation copy)

#### Step 2 — after first positive reply

```
Thanks {{name}}.

Quick brief: AntfarmDAO / Proof of Dev (Web3 developer reputation).
Apply here: https://theantfarm.tech/careers

Skills we care about from your profile: {{skills}}.
If you apply, the team reviews and then shares interview + assessment details.
```

#### Step 3 — more detail

```
{{name}} — a bit more context.

Track: Proof of Dev hiring on Collective Chat.
Careers: https://theantfarm.tech/careers
Collective username we see: {{username}}

Tell me your availability this week and which role looks closest.
```

#### Step 5 — GitHub / assessment (only when the team is ready)

```
Great. When the team opens the assessment, you may get access to {{repo}}. Accept any invite and reply here when you can open it.
```

#### Step 6 — assessment kickoff

```
{{name}}, once you can open {{repo}}, start with the README tasks. Ping me if anything is blocked.
```

#### Step 7 — close

```
Thanks {{name}}. The team will review and follow up. I will pause automated messages here unless you have a question.
```

### Platform notes

- Platform: Collective.work Sherlock search + in-app Collective Chat
- Search brief: set per account in the dashboard
- DOM selectors: `collective_work_sherlock_dom_selectors.md` + `src/lib/collective-dom.ts`
- Pipeline: do not duplicate DMs; skipped / declined sellers stay skipped
- Test chat in the dashboard previews **First msg** only; reply branches are for human ops or future reply automation
