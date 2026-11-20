# Set it up in Make.com

About 20 minutes. You'll need a Make account, an Anthropic API key, a Google account (Sheets and Gmail), and Slack.

> **Status:** the two blueprints are generated from this repo's tested code and **structure-checked in CI**: every module identifier and version comes from real exported Make blueprints, and every field mapping points at an earlier step. They have **not yet been import-tested in a Make account**. If a step looks different after import, the checklist at the end says what to check.

## Which Make plan?

Make's Free plan includes **1,000 credits per month**: most module actions use 1 credit, and routers and error handlers use none (Make pricing FAQ, checked 2026-11-20). Check [make.com/en/pricing](https://www.make.com/en/pricing) for the other Free-plan limits, such as active scenarios and the shortest schedule interval.

Rough usage with both scenarios scheduled **once a day**:

| | Credits |
|---|---|
| Scenario 1, per blog post (fetch page, HTML to text, Claude, parse, add row) | about 5 |
| Scenario 1, per daily run (reading the feed) | 1 |
| Scenario 2, per approved post (Slack message, mark as ready) | 2 |
| Scenario 2, per daily run (reading the sheet) | 1 |

A blog publishing 20 posts a month uses about **20 × 5 + 20 × 2 + 2 × 30 ≈ 200 credits**, well within the Free plan. Scheduling scenario 2 every 15 minutes instead would use about 2,900 credits a month for the sheet reads alone, so keep it daily or a few times a day.

## 1. Create the Google Sheet

Create a spreadsheet with a tab named exactly **`Drafts`**, and paste this header row into cell A1 (it splits into columns A–I):

```
status	title	url	linkedin_post	x_thread	newsletter_blurb	hashtags	confidence	created_at
```

New drafts arrive with status `pending`. To approve one, change its status to **`approved`** (any capitalisation works). Scenario 2 then sends it to Slack and sets the status to `ready`.

## 2. Import scenario 1: repurpose new posts

1. In Make, go to **Scenarios → Create a new scenario → ⋯ (More) → Import Blueprint**, and choose `make/blueprints/1-repurpose-new-posts.json`.
2. Replace the placeholders:
   - **RSS (module 1):** feed URL `https://your-blog.example/feed.xml` → your blog's feed.
   - **Gmail (modules 8, 9, 11):** recipient `marketing@your-company.example` → the marketer's address.
   - **Google Sheets (module 7):** choose your spreadsheet. The sheet `Drafts` is already set.
3. Connect your accounts when Make asks:
   - **Anthropic Claude:** an API key from [console.anthropic.com](https://console.anthropic.com/)
   - **Google:** Sheets and Gmail
4. **Schedule:** run **once a day**. The RSS step only picks up posts published in the last 24 hours, so a daily run sees each post once.
5. Click **Run once** with a recent post in your feed, and check that a `pending` row appears.

What happens to each post:
- **Drafts within every platform limit** (LinkedIn ≤ 3,000 characters, newsletter ≤ 600, 2–5 X posts of ≤ 280 each, 1–5 hashtags) → a new row in `Drafts`.
- **Drafts that break a limit** → an email to the marketer with the drafts, so nothing is lost.
- **Claude errors, or a reply that isn't JSON** → an email to the marketer, and the scenario keeps going.

## 3. Import scenario 2: send approved posts

1. Import `make/blueprints/2-send-approved-posts.json` the same way.
2. **Google Sheets (modules 1 and 3):** choose the same spreadsheet.
3. **Slack (module 2):** pick the channel where the marketer should receive ready-to-post drafts.
4. **Schedule:** once a day (or a few times a day).
5. Set one row's status to `approved`, click **Run once**, and check that Slack gets the message and the row changes to `ready`.

## What the scenario checks, and what it doesn't

Make filters can check lengths and counts, so scenario 1 enforces every platform **limit**. Two rules need code that a Make filter can't express:
- **duplicate hashtags**
- **numbers that don't appear in the article**

For those, the prompt instructs Claude to use only the article's numbers and distinct hashtags. This repo's `src/validate.ts` checks both in the demo and the live evaluation, so you can measure how well Claude follows them. In production the marketer's approval step is the safety net.

## After import: verification checklist

These points come from real exported blueprints, but check them once in your account:

- [ ] **Claude module (4):** the **System** field contains the prompt, and the model is `claude-opus-5-5`, or the newest Claude model listed. Max tokens is `16000`.
- [ ] **Parse JSON (5):** the input reads Claude's reply (`textResponse`). If your Claude module shows the reply under a different name, such as `Content[] → Text`, map that instead.
- [ ] **Router filters (7, 8):** the conditions reference the parsed fields (`linkedin_post`, `x_thread`, `newsletter_blurb`, `hashtags`). After the first **Run once**, Make knows the parsed structure and shows them by name.
- [ ] **RSS (1):** the item fields `title`, `url`, `author` and `dateCreated` exist in your feed's output.
- [ ] **Sheets update (scenario 2, module 3):** the row number maps to the row found in module 1 (`Row number`).
- [ ] If Make reports a module version mismatch on import, recreate that module with the same settings. The blueprint JSON shows every field.

Once this checklist passes, change the README status to **verified in Make**.
