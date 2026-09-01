interface GlossaryCategoryOption {
  value: string
  title: string
}

function defineGlossaryCategories<const CategoryOptions extends readonly GlossaryCategoryOption[]>(
  categories: CategoryOptions,
): CategoryOptions {
  return categories;
}

export const GLOSSARY_CATEGORIES = defineGlossaryCategories( [
  { value: "plant-biology", title: "Plant Biology" },
  { value: "cultivation", title: "Cultivation" },
  { value: "environment", title: "Environment" },
  { value: "nutrition", title: "Nutrition" },
  { value: "chemistry", title: "Chemistry" },
  { value: "post-harvest", title: "Post-Harvest" },
  { value: "business-regulation", title: "Business & Regulation" },
] );

export type GlossaryCategory = ( typeof GLOSSARY_CATEGORIES )[number]["value"]

export function isGlossaryCategory( value: unknown ): value is GlossaryCategory {
  return typeof value === "string" && GLOSSARY_CATEGORIES.some( category => category.value === value );
}

export function glossaryCategoryLabel( value: GlossaryCategory ): string {
  const category = GLOSSARY_CATEGORIES.find( candidate => candidate.value === value );
  if( !category ) throw new Error( `Unknown glossary category: ${value}` );
  return category.title;
}
