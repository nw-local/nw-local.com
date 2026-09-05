import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, expect, test } from "vitest";
import { assertPesticideDisclosure } from "../lib/pesticide-disclosure.ts";
import { makeNoneAppliedDisclosureFixture, makePesticideDisclosureFixture } from "../../scripts/fixtures/pesticide-disclosure.ts";
import PesticideDisclosureBody from "./PesticideDisclosureBody.astro";

const temporaryDirectories: string[] = [];

afterEach( async () => {
  await Promise.all( temporaryDirectories.splice( 0 ).map( directory => rm( directory, { recursive: true }) ) );
});

async function checkRenderedDisclosure( body: string ): Promise<{ status: number | null; stderr: string }> {
  const fixtureRoot = await mkdtemp( join( tmpdir(), "pesticide-disclosure-component-" ) );
  temporaryDirectories.push( fixtureRoot );
  await mkdir( fixtureRoot, { recursive: true });
  await writeFile(
    join( fixtureRoot, "pesticide-disclosure-page.html" ),
    `<main>${body}</main>`,
    "utf8",
  );

  const result = spawnSync(
    "python3",
    [ "scripts/check-pesticide-disclosure-build.py", "--fixture", fixtureRoot ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  return { status: result.status, stderr: result.stderr };
}

test( "renders a disclosed pesticide application through the real component and passes the built-page contract", async () => {
  const disclosureFixture: unknown = makePesticideDisclosureFixture();
  assertPesticideDisclosure( disclosureFixture );
  const container = await AstroContainer.create();
  const body = await container.renderToString( PesticideDisclosureBody, { props: { disclosure: disclosureFixture } });

  const result = await checkRenderedDisclosure( body );

  expect( result.status, result.stderr ).toBe( 0 );
});

test( "renders a none-applied disclosure through the real component and passes the built-page contract", async () => {
  const disclosureFixture: unknown = makeNoneAppliedDisclosureFixture();
  assertPesticideDisclosure( disclosureFixture );
  const container = await AstroContainer.create();
  const body = await container.renderToString( PesticideDisclosureBody, { props: { disclosure: disclosureFixture } });

  const result = await checkRenderedDisclosure( body );

  expect( result.status, result.stderr ).toBe( 0 );
});
