/**
 * Generates the two Make.com scenario blueprints from the tested sources, so the prompt and the
 * limits inside them are always the ones the tests prove.
 *
 *   npm run build:blueprints  ->  make/blueprints/1-repurpose-new-posts.json
 *                                 make/blueprints/2-send-approved-posts.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_MODEL, renderSystemPrompt } from '../src/request.js';
import { LIMITS } from '../src/validate.js';

export const BLUEPRINT_FILES = ['1-repurpose-new-posts.json', '2-send-approved-posts.json'] as const;

/** Columns of the "Drafts" sheet, in order (A…I). Scenario 1 writes them; scenario 2 reads them by index. */
export const DRAFTS_COLUMNS = ['status', 'title', 'url', 'linkedin_post', 'x_thread', 'newsletter_blurb', 'hashtags', 'confidence', 'created_at'] as const;

type Condition = { a: string; b: string; o: string };
type Json = Record<string, unknown>;

const SCENARIO_SETTINGS = {
  roundtrips: 1,
  maxErrors: 3,
  autoCommit: true,
  autoCommitTriggerLast: true,
  sequential: false,
  slots: null,
  confidential: false,
  dataloss: false,
  dlq: false,
  freshVariables: false,
};

const at = (x: number, y: number) => ({ designer: { x, y } });

/** Placeholder the client replaces after import (their email, spreadsheet, Slack channel). */
const MARKETER_EMAIL = 'marketing@your-company.example';

function marketerEmail(id: number, x: number, y: number, subject: string, html: string): Json {
  return {
    id,
    module: 'google-email:ActionSendEmail',
    version: 2,
    parameters: {},
    mapper: { to: [MARKETER_EMAIL], cc: [], bcc: [], from: '', subject, html, attachments: [] },
    metadata: at(x, y),
  };
}
const ignore = (id: number, x: number, y: number): Json => ({ id, module: 'builtin:Ignore', version: 1, parameters: {}, mapper: null, metadata: at(x, y) });

/** The draft checks Make can do in a filter. Duplicate-hashtag and invented-number checks need code (see README). */
function draftChecks(p: number): Condition[] {
  const len = (expr: string) => `{{length(${expr})}}`;
  return [
    { a: len(`${p}.linkedin_post`), b: '1', o: 'number:greaterorequal' },
    { a: len(`${p}.linkedin_post`), b: String(LIMITS.linkedin), o: 'number:lessorequal' },
    { a: len(`${p}.newsletter_blurb`), b: '1', o: 'number:greaterorequal' },
    { a: len(`${p}.newsletter_blurb`), b: String(LIMITS.newsletter), o: 'number:lessorequal' },
    { a: len(`${p}.x_thread`), b: String(LIMITS.xPostsMin), o: 'number:greaterorequal' },
    { a: len(`${p}.x_thread`), b: String(LIMITS.xPostsMax), o: 'number:lessorequal' },
    // A thread may have fewer posts than the maximum: ifempty() turns a missing post into "" (length 0).
    ...Array.from({ length: LIMITS.xPostsMax }, (_, i) => ({ a: len(`ifempty(get(${p}.x_thread; ${i + 1}); "")`), b: String(LIMITS.xPost), o: 'number:lessorequal' })),
    { a: len(`${p}.hashtags`), b: String(LIMITS.hashtagsMin), o: 'number:greaterorequal' },
    { a: len(`${p}.hashtags`), b: String(LIMITS.hashtagsMax), o: 'number:lessorequal' },
  ];
}
const OPPOSITE: Record<string, string> = { 'number:lessorequal': 'number:greater', 'number:greaterorequal': 'number:less' };

export function buildRepurposeScenario(): Json {
  // 1 RSS → 2 fetch page → 3 HTML to text → 4 Claude → 5 parse JSON → 6 router → 7 sheet | 8 email marketer
  const userMessage = [
    'Write social and newsletter drafts for this blog post.',
    '',
    '<article>',
    'title: {{1.title}}',
    'url: {{1.url}}',
    'author: {{1.author}}',
    'published: {{1.dateCreated}}',
    '',
    'text:',
    `{{substring(3.text; 0; ${LIMITS.articleChars})}}{{if(length(3.text) > ${LIMITS.articleChars}; "\n[truncated]"; "")}}`,
    '</article>',
  ].join('\n');

  const checks = draftChecks(5);
  return {
    name: 'AI content repurposing: new blog post → LinkedIn, X thread, newsletter drafts',
    flow: [
      {
        id: 1,
        module: 'rss:ActionReadArticles',
        version: 4,
        parameters: { include: [] },
        // Run the scenario once a day: only posts published in the last 24 hours are picked up.
        mapper: { url: 'https://your-blog.example/feed.xml', gzip: true, username: '', password: '', maxResults: '10', filterDateFrom: '{{addHours(now; -24)}}', filterDateTo: '' },
        metadata: at(0, 0),
      },
      {
        id: 2,
        module: 'http:ActionSendData',
        version: 3,
        // handleErrors: a 4xx/5xx page (blocked, missing) is an error, not text to draft from.
        parameters: { handleErrors: true, useNewZLibDeCompress: true },
        mapper: { url: '{{1.url}}', method: 'get', serializeUrl: false, headers: [], qs: [], bodyType: '', parseResponse: false, timeout: '20', followRedirect: true, gzip: true, rejectUnauthorized: true, shareCookies: false, useQuerystring: false, useMtls: false, ca: '', authUser: '', authPass: '' },
        metadata: at(300, 0),
        onerror: [
          marketerEmail(13, 300, 300, 'Could not read the post "{{1.title}}"', '<p>The page <a href="{{1.url}}">{{1.title}}</a> could not be fetched (status {{2.statusCode}}), so no drafts were written.</p><p>Error: {{2.error.message}}</p>'),
          ignore(14, 600, 300),
        ],
      },
      {
        id: 3,
        module: 'regexp:HTMLToText',
        version: 1,
        parameters: {},
        mapper: { html: '{{2.data}}', newline: 'lf', uppercaseHeadings: false },
        metadata: at(600, 0),
      },
      {
        id: 4,
        module: 'anthropic-claude:createAMessage',
        version: 1,
        parameters: {},
        mapper: {
          model: DEFAULT_MODEL,
          max_tokens: 16000,
          system: renderSystemPrompt(),
          messages: [{ role: 'user', content: userMessage }],
        },
        metadata: at(900, 0),
        onerror: [
          marketerEmail(9, 900, 300, 'Content drafts failed for "{{1.title}}"', '<p>Claude could not write drafts for <a href="{{1.url}}">{{1.title}}</a>.</p><p>Error: {{4.error.message}}</p>'),
          ignore(10, 1200, 300),
        ],
      },
      {
        id: 5,
        module: 'json:ParseJSON',
        version: 1,
        parameters: { type: '' },
        // Claude sometimes wraps JSON in a ```json fence; strip it before parsing.
        mapper: { json: '{{trim(replace(replace(4.textResponse; "```json"; ""); "```"; ""))}}' },
        metadata: at(1200, 0),
        onerror: [
          marketerEmail(11, 1200, 450, 'Unreadable drafts for "{{1.title}}"', '<p>Claude\'s reply for <a href="{{1.url}}">{{1.title}}</a> was not valid JSON, so nothing was added to the sheet.</p><pre>{{4.textResponse}}</pre>'),
          ignore(12, 1500, 450),
        ],
      },
      {
        id: 6,
        module: 'builtin:BasicRouter',
        version: 1,
        mapper: null,
        metadata: at(1500, 0),
        routes: [
          {
            flow: [
              {
                id: 7,
                module: 'google-sheets:addRow',
                version: 2,
                parameters: {},
                filter: { name: 'Drafts meet every platform limit', conditions: [checks] },
                mapper: {
                  from: 'drive',
                  mode: 'select',
                  spreadsheetId: '',
                  sheetId: 'Drafts',
                  includesHeaders: true,
                  insertDataOption: 'INSERT_ROWS',
                  // RAW: AI-written text is stored as text and never evaluated as a formula.
                  valueInputOption: 'RAW',
                  insertUnformatted: false,
                  values: {
                    '0': 'pending',
                    '1': '{{1.title}}',
                    '2': '{{1.url}}',
                    '3': '{{5.linkedin_post}}',
                    '4': '{{join(5.x_thread; "\n\n---\n\n")}}',
                    '5': '{{5.newsletter_blurb}}',
                    '6': '{{join(5.hashtags; " ")}}',
                    '7': '{{5.confidence}}',
                    '8': '{{formatDate(now; "YYYY-MM-DD HH:mm")}}',
                  },
                },
                metadata: at(1800, -150),
              },
            ],
          },
          {
            flow: [
              {
                ...marketerEmail(8, 1800, 150, 'Drafts need a rewrite: "{{1.title}}"', '<p>Claude\'s drafts for <a href="{{1.url}}">{{1.title}}</a> break a platform limit (length, number of posts or hashtags), so they were not added to the sheet.</p><p><strong>LinkedIn:</strong><br>{{5.linkedin_post}}</p><p><strong>X thread:</strong><br>{{join(5.x_thread; "<br>---<br>")}}</p><p><strong>Newsletter:</strong><br>{{5.newsletter_blurb}}</p>'),
                filter: { name: 'Drafts break a platform limit', conditions: checks.map((c) => [{ ...c, o: OPPOSITE[c.o] }]) },
              },
            ],
          },
        ],
      },
    ],
    metadata: { instant: false, version: 1, scenario: SCENARIO_SETTINGS, designer: { orphans: [] } },
  };
}

export function buildApprovedScenario(): Json {
  // Columns in the "Drafts" sheet: 0 status · 1 title · 2 url · 3 LinkedIn · 4 X thread · 5 newsletter · 6 hashtags · 7 confidence · 8 created
  const col = (i: number) => `{{1.\`${i}\`}}`;
  return {
    name: 'AI content repurposing: send approved drafts, ready to post',
    flow: [
      {
        id: 1,
        module: 'google-sheets:filterRows',
        version: 2,
        parameters: {},
        // Ask Sheets for approved rows only (column A), so a long sheet can't push them past the row limit.
        mapper: { from: 'drive', spreadsheetId: '', sheetId: 'Drafts', includesHeaders: true, tableFirstRow: 'A1:I1', filter: [[{ a: 'A', b: 'approved', o: 'text:equal:ci' }]], sortOrder: 'asc', valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' },
        metadata: at(0, 0),
      },
      {
        id: 2,
        module: 'slack:CreateMessage',
        version: 4,
        parameters: {},
        filter: { name: 'Only rows marked approved', conditions: [[{ a: col(0), b: 'approved', o: 'text:equal:ci' }]] },
        mapper: {
          channelWType: 'list',
          channelType: 'public',
          channel: '',
          parse: false,
          mrkdwn: true,
          text: [
            `:white_check_mark: *Approved and ready to post:* <${col(2)}|${col(1)}>`,
            '',
            '*LinkedIn*',
            col(3),
            '',
            '*X thread* (post each part as a reply to the one before)',
            col(4),
            '',
            '*Newsletter*',
            col(5),
            '',
            `*Hashtags:* ${col(6)}`,
          ].join('\n'),
        },
        metadata: at(300, 0),
      },
      {
        id: 3,
        module: 'google-sheets:updateRow',
        version: 2,
        parameters: {},
        mapper: { from: 'drive', mode: 'select', spreadsheetId: '', sheetId: 'Drafts', rowNumber: '{{1.__ROW_NUMBER__}}', includesHeaders: true, valueInputOption: 'RAW', values: { '0': 'ready' } },
        metadata: at(600, 0),
      },
    ],
    metadata: { instant: false, version: 1, scenario: SCENARIO_SETTINGS, designer: { orphans: [] } },
  };
}

export function buildBlueprints(): Record<(typeof BLUEPRINT_FILES)[number], Json> {
  return { [BLUEPRINT_FILES[0]]: buildRepurposeScenario(), [BLUEPRINT_FILES[1]]: buildApprovedScenario() } as Record<(typeof BLUEPRINT_FILES)[number], Json>;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync('make/blueprints', { recursive: true });
  for (const [file, blueprint] of Object.entries(buildBlueprints())) {
    writeFileSync(`make/blueprints/${file}`, JSON.stringify(blueprint, null, 2) + '\n');
    console.log(`wrote make/blueprints/${file}`);
  }
}
