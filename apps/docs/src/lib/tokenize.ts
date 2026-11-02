export const SEARCH_FIELDS = ['title', 'titles', 'text'];
export const SEARCH_STORE_FIELDS = ['title', 'titles'];

export function createTokenizer(lang: string) {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });

  return (text: string) =>
    Array.from(segmenter.segment(text))
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment);
}
