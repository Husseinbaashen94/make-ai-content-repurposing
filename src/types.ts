import { z } from 'zod';

/** A blog post as Make's RSS module provides it, plus the article page's HTML. */
export const ArticleSchema = z
  .object({
    title: z.string().min(1),
    url: z.string().url(),
    published_at: z.string().datetime({ offset: true }),
    author: z.string(),
    html: z.string().min(1),
  })
  .strict();
export type Article = z.infer<typeof ArticleSchema>;

/** Claude's drafts for one article. Mirrors schemas/drafts.schema.json. */
export const DraftsSchema = z
  .object({
    linkedin_post: z.string(),
    x_thread: z.array(z.string()),
    newsletter_blurb: z.string(),
    hashtags: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type Drafts = z.infer<typeof DraftsSchema>;
