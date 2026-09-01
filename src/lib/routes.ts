export const AUTHOR_BASE_PATH = "/authors";
export const GLOSSARY_BASE_PATH = "/glossary";

export function glossaryHref( slug: string ): string {
  return `${GLOSSARY_BASE_PATH}/${slug}`;
}
