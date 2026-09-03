import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";
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
  expect( html ).toContain( "29.4% Total THC" );
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

test( "the chapter's own links sit before the package table", async () => {
  const html = await renderChapter( makeChapterFixture() );
  const packages = html.indexOf( `class="drop-packages"` );
  expect( packages ).toBeGreaterThan( -1 );
  expect( html.indexOf( "data-drop-coa" ) ).toBeLessThan( packages );
  expect( html.indexOf( `class="drop-chapter-title"` ) ).toBeLessThan( packages );
});

test( "renders each package as an aligned table row: size, weight and availability, no repeated photo", async () => {
  const html = await renderChapter( makeChapterFixture() );
  // The size label is the product name with its strain-name prefix stripped.
  expect( html ).toContain( ">Eighth<" );
  expect( html ).toContain( ">Quarter<" );
  expect( html ).toContain( ">3.5g<" );
  expect( html ).toContain( ">7g<" );
  expect( html ).toContain( ">In stock<" );
  expect( html ).toContain( ">Sold out<" );
  expect( html ).toContain( `data-available="true"` );
  expect( html ).toContain( `data-available="false"` );
  // No product-card image markup: the chapter hero is the only strain photo.
  expect( html ).not.toContain( `class="card"` );
});

test( "a strain with no hero image has no buy link, since the photo is the only one", async () => {
  const chapter = makeChapterFixture();
  chapter.strain.cultiveraMarketProductId = "14303";
  const html = await renderChapter( chapter );
  // The buy link lives on the photo alone; with no photo there is nothing to
  // attach it to, and we do not fall back to a button or a text link.
  expect( html ).not.toContain( "data-order-cultivera" );
  expect( html ).not.toContain( "cultivera-textlink" );
  expect( html ).not.toContain( "btn-accent" );
});

test( "the hero photo is the buy link, wrapping the image with an accessible name and no visible marketplace label", async () => {
  const chapter = makeChapterFixture();
  chapter.strain.cultiveraMarketProductId = "14303";
  chapter.strain.heroImage = {
    asset: { _ref: "image-abc123-1200x900-jpg" },
    alt: "Glitter Bomb flower under grow lights",
  };
  const html = await renderChapter( chapter );
  const marketUrl = "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llc/product/14303";
  expect( html ).toContain( `class="drop-chapter-media-frame"` );
  expect( html ).toMatch( new RegExp( `<a[^>]*class="drop-chapter-media-frame"[^>]*href="${marketUrl.replace( /[/]/g, "\\/" )}"` ) );
  // Accessible name promotes the strain, not the marketplace, and there is no
  // visible caption/label on the photo.
  expect( html ).toContain( `aria-label="Order Glitter Bomb"` );
  expect( html ).not.toContain( "Cultivera" );
  expect( html ).not.toContain( "cultivera-textlink" );
  expect( html ).not.toContain( "btn-accent" );
  expect( html.split( "data-order-cultivera" ).length - 1 ).toBe( 1 );
});

test( "omits the buy link entirely when the strain has no marketplace id", async () => {
  const chapter = makeChapterFixture();
  chapter.strain.heroImage = {
    asset: { _ref: "image-abc123-1200x900-jpg" },
    alt: "Glitter Bomb flower under grow lights",
  };
  const html = await renderChapter( chapter );
  // Photo renders, but as a plain frame, not an anchor.
  expect( html ).not.toContain( "data-order-cultivera" );
  expect( html ).not.toMatch( /<a[^>]*class="drop-chapter-media-frame"/ );
});

const temporaryDirectories: string[] = [];

afterEach( async () => {
  await Promise.all( temporaryDirectories.splice( 0 ).map( directory => rm( directory, { recursive: true }) ) );
});

test( "the rendered chapter passes the built-page contract", async () => {
  const chapter = makeChapterFixture();
  const body = await renderChapter( chapter );
  const fixtureRoot = await mkdtemp( join( tmpdir(), "drop-chapter-" ) );
  temporaryDirectories.push( fixtureRoot );
  await mkdir( join( fixtureRoot, "coas", CHAPTER_COA_SOURCE_ID ), { recursive: true });
  await writeFile( join( fixtureRoot, "coas", CHAPTER_COA_SOURCE_ID, "index.html" ), "<main></main>", "utf8" );
  await writeFile( join( fixtureRoot, "drop-coas.json" ), JSON.stringify( [ CHAPTER_COA_SOURCE_ID ] ), "utf8" );
  await writeFile(
    join( fixtureRoot, "drop-page.html" ),
    `<main><article class="drop-page" data-drop-page="september-fixture">${body}</article></main>`,
    "utf8",
  );

  const result = spawnSync(
    "python3",
    [ "scripts/check-drop-build.py", "--fixture", fixtureRoot ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect( result.status, result.stderr ).toBe( 0 );
});
