import type { APIRoute } from "astro";
import { dropCoaManifest } from "../../../lib/drops";
import { getDrop, getDrops } from "../../../lib/sanity";

// Emits dist/drops/<slug>/coas.json: the sorted source ids of every
// certificate the drop references, from the same getDrop() + validation the
// page renders from. scripts/check-drop-build.py compares the built page's
// data-drop-coa links against this file, so the checker needs no Sanity
// access and the two cannot disagree by construction. Not linked from any
// page; carries nothing but the ids.
export async function getStaticPaths() {
  const drops = await getDrops() ?? [];
  return drops.map( drop => ({ params: { slug: drop.slug.current } }) );
}

export const GET: APIRoute = async ({ params }) => {
  if( !params.slug ) throw new Error( "coas.json route requires a drop slug." );
  const drop = await getDrop( params.slug );
  if( !drop ) throw new Error( `coas.json: no drop with slug ${params.slug}.` );
  return new Response( JSON.stringify( dropCoaManifest( drop.coas ) ), {
    headers: { "Content-Type": "application/json" },
  });
};
