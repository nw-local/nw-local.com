import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import type { DropChapter } from "../lib/drops.ts";
import DropStrainChapter from "./DropStrainChapter.astro";

export const CHAPTER_COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export function makeChapterFixture(): DropChapter {
  return {
    index: 1,
    color: "#00ff88",
    anchorId: "strain-glitter-bomb",
    strain: {
      key: "strain-glitter-bomb",
      name: "Glitter Bomb",
      slug: { current: "glitter-bomb" },
      strainType: "hybrid",
      lineage: "Grape Gas #10 × OGKB Blueberry Headband",
    },
    products: [
      { _id: "p1", name: "Glitter Bomb Eighth", slug: { current: "glitter-bomb-eighth" }, category: "flower", weight: "3.5g", available: true },
      { _id: "p2", name: "Glitter Bomb Quarter", slug: { current: "glitter-bomb-quarter" }, category: "flower", weight: "7g", available: false },
    ],
    available: true,
    coa: {
      sourceId: CHAPTER_COA_SOURCE_ID,
      labResultId: "2155470281845367208-18-2026",
      status: "pass",
      publishedAt: "2026-09-01T21:15:30Z",
      totalThc: { value: "29.39", unit: "%" },
      strain: { name: "Glitter Bomb", url: "https://nw-local.com/strains/glitter-bomb/" },
    },
  };
}

export async function renderChapter( chapter: DropChapter ): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString( DropStrainChapter, { props: { chapter, chapterCount: 4 } });
}

test( "renders lineage, COA link, COA-basis THC and the state badge", async () => {
  const html = await renderChapter( makeChapterFixture() );
  expect( html ).toContain( `data-drop-chapter="strain-glitter-bomb"` );
  expect( html ).toContain( `data-drop-lineage="Grape Gas #10 × OGKB Blueberry Headband"` );
  expect( html ).toContain( `data-drop-coa="${CHAPTER_COA_SOURCE_ID}" href="/coas/${CHAPTER_COA_SOURCE_ID}/"` );
  expect( html ).toContain( "Release COA · Pass" );
  expect( html ).toContain( "29.39% Total THC" );
  expect( html ).toContain( `data-drop-state="available"` );
  expect( html ).toContain( "01 / 04" );
  expect( html ).not.toContain( "$" );
});

test( "omits the THC line and COA link when the chapter has no certificate, and reads sold out", async () => {
  const chapter = makeChapterFixture();
  delete chapter.coa;
  chapter.available = false;
  const html = await renderChapter( chapter );
  expect( html ).not.toContain( "Total THC" );
  expect( html ).not.toContain( "data-drop-coa" );
  expect( html ).toContain( `data-drop-state="soldOut"` );
});

test( "the chapter's own links sit outside the product cards", async () => {
  const html = await renderChapter( makeChapterFixture() );
  const firstCard = html.indexOf( `class="card"` );
  expect( html.indexOf( "data-drop-coa" ) ).toBeLessThan( firstCard );
  expect( html.indexOf( `class="drop-chapter-title"` ) ).toBeLessThan( firstCard );
});
