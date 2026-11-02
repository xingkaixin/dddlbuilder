import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({
    pattern: '{zh,en,ja}/**/*.md',
    base: '.',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    outline: z.tuple([z.number(), z.number()]).optional(),
  }),
});

export const collections = { docs };
