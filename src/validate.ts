import { DraftsSchema, type Drafts } from './types.js';

/** Platform limits. The Make router filter in scenario 1 uses the same numbers (a test checks it). */
export const LIMITS = {
  xPost: 280,
  xPostsMin: 2,
  xPostsMax: 5,
  linkedin: 3000,
  newsletter: 600,
  hashtagsMin: 1,
  hashtagsMax: 5,
  articleChars: 15000,
} as const;

/** Length in Unicode code points: an accented letter or an emoji counts as one character. */
const length = (text: string) => [...text].length;

/** Reads Claude's reply: tolerates a ```json fence and prose around the object. Never throws. */
export function parseDrafts(text: string): { drafts?: Drafts; error?: string } {
  const cleaned = String(text ?? '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return { error: 'AI answer is not valid JSON' };
  let value: unknown;
  try {
    value = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return { error: 'AI answer is not valid JSON' };
  }
  const parsed = DraftsSchema.safeParse(value);
  return parsed.success ? { drafts: parsed.data } : { error: 'AI answer has the wrong shape' };
}

/** Numbers as written in text, normalised (thousands commas removed), ignoring URLs and hashtags. */
export function numbersIn(text: string): string[] {
  const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/#\S+/g, ' ');
  return (cleaned.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, '').replace(/,$/, ''));
}

export function validateDrafts(drafts: Drafts, articleText: string): { valid: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!drafts.linkedin_post.trim()) problems.push('empty linkedin_post');
  else if (length(drafts.linkedin_post) > LIMITS.linkedin) {
    problems.push(`linkedin_post is ${length(drafts.linkedin_post)} characters (max ${LIMITS.linkedin})`);
  }

  const posts = drafts.x_thread.length;
  if (posts < LIMITS.xPostsMin || posts > LIMITS.xPostsMax) {
    problems.push(`x_thread has ${posts} posts (need ${LIMITS.xPostsMin}-${LIMITS.xPostsMax})`);
  }
  drafts.x_thread.forEach((post, i) => {
    if (!post.trim()) problems.push(`x_thread post ${i + 1} is empty`);
    else if (length(post) > LIMITS.xPost) problems.push(`x_thread post ${i + 1} is ${length(post)} characters (max ${LIMITS.xPost})`);
  });

  if (!drafts.newsletter_blurb.trim()) problems.push('empty newsletter_blurb');
  else if (length(drafts.newsletter_blurb) > LIMITS.newsletter) {
    problems.push(`newsletter_blurb is ${length(drafts.newsletter_blurb)} characters (max ${LIMITS.newsletter})`);
  }

  const tags = drafts.hashtags.length;
  if (tags < LIMITS.hashtagsMin || tags > LIMITS.hashtagsMax) {
    problems.push(`hashtags: ${tags} (need ${LIMITS.hashtagsMin}-${LIMITS.hashtagsMax})`);
  }
  const seen = new Set<string>();
  for (const tag of drafts.hashtags) {
    if (!/^#[^\s#]+$/u.test(tag)) problems.push(`hashtag "${tag}" is not a single #word`);
    else if (seen.has(tag.toLowerCase())) problems.push(`duplicate hashtag ${tag}`);
    seen.add(tag.toLowerCase());
  }

  const allowed = new Set(numbersIn(articleText));
  const reported = new Set<string>();
  for (const text of [drafts.linkedin_post, ...drafts.x_thread, drafts.newsletter_blurb]) {
    for (const n of numbersIn(text)) {
      if (!allowed.has(n) && !reported.has(n)) {
        reported.add(n);
        problems.push(`number not in the article: ${n}`);
      }
    }
  }

  return { valid: problems.length === 0, problems };
}
