/**
 * Draws the annotated ribbon-construction diagram used as a figure in the
 * manuscript, explaining the control points of `paths/outline.js`.
 *
 * A reviewer asked for a figure to accompany the tangent-scaling formula. The
 * curves here are produced by `outlinePathPoints` itself rather than redrawn
 * by hand, so the figure cannot drift from the construction it illustrates.
 *
 * Output is SVG. The manuscript embeds a PDF conversion of it; any SVG
 * renderer will do, for example:
 *
 *     node benchmarks/ribbon-figure.js out/fig-ribbon.svg
 *     rsvg-convert -f pdf -o fig-ribbon.pdf out/fig-ribbon.svg
 *
 * Usage: `node benchmarks/ribbon-figure.js <output.svg>`
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperan\u00e7a and contributors
 */

import { writeFileSync } from "node:fs";
import { outlinePathPoints } from "../src/paths/outline.js";


const W=600,H=320;
const x1=120, x2=470;
const Ys=175, Yt=205;
const sizes=[40,54,34];
const S=sizes.reduce((a,b)=>a+b,0);
const d=((x2-x1)/2)*1;
let accS=Ys-S/2, accT=Yt-S/2;
const ribbons=[];
for(const s of sizes){
  const a=[x1,accS+s/2], b=[x2,accT+s/2];
  ribbons.push({a,b,size:s,curves:outlinePathPoints({
    a,b,at:[d,0],bt:[-d,0],ap:[x1,Ys],bp:[x2,Yt],size:s,maxAngle:30})});
  accS+=s; accT+=s;
}
/** One cubic as an open SVG path. @param {number[][]} c */
const C = (c) => `M ${c[0]} C ${c[1]} ${c[2]} ${c[3]}`;
/** The closed ribbon between two side curves. @param {number[][]} lo @param {number[][]} hi */
const fill = (lo, hi) =>
  `M ${lo[0]} C ${lo[1]} ${lo[2]} ${lo[3]} L ${hi[3]} C ${hi[2]} ${hi[1]} ${hi[0]} Z`;
/** A glyph with a subscript. @param {string} t @param {string} x */
const sub = (t, x) =>
  `${t}<tspan font-size="9" dy="3">${x}</tspan><tspan dy="-3"></tspan>`;

const o=[];
o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
o.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
o.push(`<defs>
<marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#1a7f37"/></marker>
<marker id="arb" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#2b4c7e"/></marker>
</defs>`);
o.push(`<g font-family="Times, serif" font-size="14" fill="#111">`);

const tint=["#f6dfc4","#dde7f3","#dde7f3"];
ribbons.forEach((r,i)=>o.push(`<path d="${fill(r.curves[0],r.curves[1])}" fill="${tint[i]}"/>`));
ribbons.forEach(r=>r.curves.forEach(c=>o.push(`<path d="${C(c)}" fill="none" stroke="#2b4c7e" stroke-width="1.4"/>`)));

// node bars
o.push(`<rect x="${x1-14}" y="${Ys-S/2-18}" width="14" height="${S+36}" fill="#9a9a9a"/>`);
o.push(`<rect x="${x2}" y="${Yt-S/2-18}" width="14" height="${S+36}" fill="#9a9a9a"/>`);
o.push(`<text x="${x1-20}" y="${Ys-S/2-24}" text-anchor="middle" font-size="12" fill="#555">source</text>`);
o.push(`<text x="${x2+22}" y="${Yt-S/2-24}" text-anchor="middle" font-size="12" fill="#555">target</text>`);

// reference line between NODE centres
o.push(`<line x1="${x1}" y1="${Ys}" x2="${x2}" y2="${Yt}" stroke="#b03030" stroke-width="1.4" stroke-dasharray="7 4"/>`);
o.push(`<circle cx="${x1}" cy="${Ys}" r="3.2" fill="#b03030"/><circle cx="${x2}" cy="${Yt}" r="3.2" fill="#b03030"/>`);
o.push(`<text x="${x1-22}" y="${Ys+16}" text-anchor="end" fill="#b03030">${sub("p","a")}</text>`);
o.push(`<text x="${x2+22}" y="${Yt+16}" fill="#b03030">${sub("p","b")}</text>`);
o.push(`<text x="305" y="${(Ys+Yt)/2+20}" text-anchor="middle" fill="#b03030" font-style="italic" font-size="12">reference line, direction u</text>`);

// --- annotate the TOP ribbon, whose centre is well off the node centre ---
const m=ribbons[0];
const [ax,ay]=m.a,[bx,by]=m.b;
const upper=m.curves[0][0][1], p1=m.curves[0][1];
o.push(`<circle cx="${ax}" cy="${ay}" r="3.2" fill="#111"/><circle cx="${bx}" cy="${by}" r="3.2" fill="#111"/>`);
o.push(`<text x="${ax-22}" y="${ay+5}" text-anchor="end">a</text>`);
o.push(`<text x="${bx+22}" y="${by+5}">b</text>`);
// q_a bracket, well clear of the node bar
const qx=x1-46;
o.push(`<line x1="${qx}" y1="${ay}" x2="${qx}" y2="${Ys}" stroke="#111" stroke-width="1"/>`);
o.push(`<line x1="${qx-5}" y1="${ay}" x2="${qx+5}" y2="${ay}" stroke="#111" stroke-width="1"/>`);
o.push(`<line x1="${qx-5}" y1="${Ys}" x2="${qx+5}" y2="${Ys}" stroke="#111" stroke-width="1"/>`);
o.push(`<text x="${qx-9}" y="${(ay+Ys)/2+5}" text-anchor="end">${sub("q","a")}</text>`);
// delta bracket from ribbon centre to its upper boundary
const dx2=x1+20;
o.push(`<line x1="${dx2}" y1="${ay}" x2="${dx2}" y2="${upper}" stroke="#111" stroke-width="1"/>`);
o.push(`<line x1="${dx2-5}" y1="${upper}" x2="${dx2+5}" y2="${upper}" stroke="#111" stroke-width="1"/>`);
o.push(`<line x1="${dx2-5}" y1="${ay}" x2="${dx2+5}" y2="${ay}" stroke="#111" stroke-width="1"/>`);
o.push(`<text x="${dx2+9}" y="${(ay+upper)/2+5}">&#948;</text>`);
// tangent
o.push(`<line x1="${ax}" y1="${upper}" x2="${p1[0]}" y2="${p1[1]}" stroke="#1a7f37" stroke-width="1.8" marker-end="url(#ar)"/>`);
o.push(`<circle cx="${p1[0]}" cy="${p1[1]}" r="3" fill="#1a7f37"/>`);
o.push(`<text x="${(ax+p1[0])/2+14}" y="${upper-10}" text-anchor="middle" fill="#1a7f37">&#963;&#183;${sub("t","a")}</text>`);
o.push(`<text x="${p1[0]+4}" y="${p1[1]-9}" fill="#1a7f37" font-size="12">${sub("P","1")}</text>`);
o.push(`<text x="${ax-6}" y="${upper-9}" text-anchor="end" font-size="12">${sub("P","0")}</text>`);

// shared-boundary call-out, into the empty band above the bundle
const shared=ribbons[0].curves[1];
const tB=0.78, u1=1-tB;
const bx2=u1*u1*u1*shared[0][0]+3*u1*u1*tB*shared[1][0]+3*u1*tB*tB*shared[2][0]+tB*tB*tB*shared[3][0];
const by2=u1*u1*u1*shared[0][1]+3*u1*u1*tB*shared[1][1]+3*u1*tB*tB*shared[2][1]+tB*tB*tB*shared[3][1];
o.push(`<text x="${W-16}" y="40" text-anchor="end" font-style="italic" fill="#2b4c7e" font-size="12">a single curve, shared by the</text>`);
o.push(`<text x="${W-16}" y="56" text-anchor="end" font-style="italic" fill="#2b4c7e" font-size="12">ribbons on either side of it</text>`);
o.push(`<line x1="${W-150}" y1="62" x2="${bx2+6}" y2="${by2-6}" stroke="#2b4c7e" stroke-width="1" marker-end="url(#arb)"/>`);
o.push(`</g></svg>`);
const target = process.argv[2];
if (!target) {
  console.error("usage: node benchmarks/ribbon-figure.js <output.svg>");
  process.exit(1);
}
writeFileSync(target, o.join("\n"));
console.log(`wrote ${target}`);
