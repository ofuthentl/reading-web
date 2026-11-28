import{o,j as a,F as c,G as u}from"./index-d3_JvSVo.js";import{M as p}from"./moon-UrrPx_ux.js";/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=o("MoonStar",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9",key:"4ay0iu"}],["path",{d:"M20 3v4",key:"1olli1"}],["path",{d:"M22 5h-4",key:"1gvqau"}]]);/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=o("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=o("Sunrise",[["path",{d:"M12 2v8",key:"1q4o3n"}],["path",{d:"m4.93 10.93 1.41 1.41",key:"2a7f42"}],["path",{d:"M2 18h2",key:"j10viu"}],["path",{d:"M20 18h2",key:"wocana"}],["path",{d:"m19.07 10.93-1.41 1.41",key:"15zs5n"}],["path",{d:"M22 22H2",key:"19qnx5"}],["path",{d:"m8 6 4-4 4 4",key:"ybng9g"}],["path",{d:"M16 18a4 4 0 0 0-8 0",key:"1lzouq"}]]),g={light:k,noon:m,dim:p,midnight:y};function b({theme:t,onCycle:r,showLabel:s=!1}){const h=g[t],n=c[t],i=c[u(t)],d=l=>{const e=l.currentTarget.getBoundingClientRect();r({x:e.left+e.width/2,y:e.top+e.height/2})};return a.jsxs("button",{type:"button",onClick:d,"aria-label":`Giao diện ${n} — bấm để chuyển sang ${i}`,title:`${n} · Bấm để chuyển sang ${i}`,className:`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-canvas text-ink transition-colors duration-200 hover:border-line-strong hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${s?"h-9 px-3 text-xs font-medium":"h-9 w-9"}`,children:[a.jsx(h,{className:"theme-icon-spin h-4 w-4 text-accent"},t),s&&a.jsx("span",{className:"text-ink-muted",children:n})]})}export{b as T};
