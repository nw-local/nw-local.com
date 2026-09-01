import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, expect, test } from "vitest";
import { assertCoa } from "../lib/coa.ts";
import { COA_SOURCE_ID, makeCoaFixture } from "../../scripts/fixtures/coa.ts";
import CoaBody from "./CoaBody.astro";

const temporaryDirectories: string[] = [];

afterEach( async () => {
  await Promise.all( temporaryDirectories.splice( 0 ).map( directory => rm( directory, { recursive: true }) ) );
});

test( "renders a validated COA through the real component and passes the built-page contract", async () => {
  const coaFixture: unknown = makeCoaFixture();
  assertCoa( coaFixture );
  const container = await AstroContainer.create();
  const body = await container.renderToString( CoaBody, { props: { coa: coaFixture } });
  const fixtureRoot = await mkdtemp( join( tmpdir(), "coa-component-" ) );
  temporaryDirectories.push( fixtureRoot );
  await mkdir( fixtureRoot, { recursive: true });
  await writeFile(
    join( fixtureRoot, "coa-page.html" ),
    `<main data-coa-source-id="${COA_SOURCE_ID}">${body}</main>`,
    "utf8",
  );

  const result = spawnSync(
    "python3",
    [ "scripts/check-coa-build.py", "--fixture", fixtureRoot ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect( result.status, result.stderr ).toBe( 0 );
});
