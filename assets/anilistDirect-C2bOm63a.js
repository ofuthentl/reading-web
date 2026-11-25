import{P as H}from"./shelfTagPresets-DCIgg1Ds.js";import"./api-CPppQ-os.js";import"./index-DtQ-NyXU.js";const M="https://graphql.anilist.co",F=6e3,_=45,b=new Set(H),C={action:"Action",adventure:"Adventure",comedy:"Comedy","dark fantasy":"Dark Fantasy",drama:"Drama",ecchi:"Ecchi",fantasy:"Fantasy","female protagonist":"Female Protagonist","video games":"Game","virtual world":"Game","full dive":"Game",game:"Game",harem:"Harem","female harem":"Harem","male harem":"Harem","mixed gender harem":"Harem",iyashikei:"Healing",healing:"Healing",historical:"Historical",horror:"Horror",isekai:"Isekai",magic:"Magic","martial arts":"Martial Arts",mecha:"Mecha",military:"Military",mystery:"Mystery","post-apocalyptic":"Post-Apocalyptic",psychological:"Psychological",romance:"Romance",school:"School Life","school life":"School Life","sci-fi":"Sci-Fi",seinen:"Seinen",shoujo:"Shoujo",shounen:"Shounen","slice of life":"Slice of Life","slow life":"Slow Life",sports:"Sports","super power":"Super Power",supernatural:"Supernatural",tragedy:"Tragedy",tsundere:"Tsundere",yandere:"Yandere",yuri:"Yuri","girls' love":"Yuri"},k=`
query SearchLightNovels($search: String!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: MANGA, format: NOVEL, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title { romaji english native }
      synonyms
      description(asHtml: false)
      genres
      isAdult
      volumes
      status
      startDate { year }
      tags { name rank isMediaSpoiler isGeneralSpoiler }
      staff(perPage: 8, sort: [RELEVANCE, ID]) {
        edges { role node { name { full native } } }
      }
    }
  }
}`;function R(n){if(!n)return null;const o=n.replace(/~![\s\S]*?!~/g,"").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p\s*>/gi,`

`).replace(/<[^>]+>/g,""),t=(new DOMParser().parseFromString(o,"text/html").body.textContent||"").replace(/\r\n?/g,`
`).replace(/\n*\s*(?:\(Source:[^)\n]+\)|\[Written by[^\]]+\])\s*$/gi,"").replace(/\n{3,}/g,`

`).trim().normalize("NFC");return t?t.length>2500?`${t.slice(0,2499).trim()}…`:t:null}function D(n){var e,t,p,s,l,c,m;let o=null;for(const a of((e=n.staff)==null?void 0:e.edges)||[]){const i=((s=(p=(t=a==null?void 0:a.node)==null?void 0:t.name)==null?void 0:p.full)==null?void 0:s.trim())||((m=(c=(l=a==null?void 0:a.node)==null?void 0:l.name)==null?void 0:c.native)==null?void 0:m.trim())||"";if(!i)continue;const u=((a==null?void 0:a.role)||"").toLowerCase();if(/story|author|original|writer|creator/.test(u))return i.normalize("NFC");!/art|illustrat|design/.test(u)&&!o&&(o=i.normalize("NFC"))}return o}function I(n){const o=new Set(["Light Novel"]);n.isAdult&&o.add("18+");for(const e of n.genres||[]){const t=e?C[e.trim().toLowerCase()]:void 0;t&&b.has(t)&&o.add(t)}for(const e of n.tags||[]){if(!(e!=null&&e.name)||e.isMediaSpoiler||e.isGeneralSpoiler||Number(e.rank??0)<_)continue;const t=C[e.name.trim().toLowerCase()];t&&b.has(t)&&o.add(t)}return Array.from(o).slice(0,16)}async function O(n,o){var s,l,c,m,a,i,u,T,A;const e=new AbortController,t=()=>e.abort();o&&(o.aborted?e.abort():o.addEventListener("abort",t,{once:!0}));const p=window.setTimeout(()=>e.abort(),F);try{const f=await fetch(M,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query:k,variables:{search:n,perPage:6}}),signal:e.signal});if(!f.ok)throw new Error(`AniList tạm thời bận (HTTP ${f.status}). Bạn vẫn có thể nhập thủ công.`);const h=await f.json().catch(()=>null),N=((l=(s=h==null?void 0:h.data)==null?void 0:s.Page)==null?void 0:l.media)||[],w=[];for(const r of N){if(!r||typeof r.id!="number")continue;const d=((m=(c=r.title)==null?void 0:c.romaji)==null?void 0:m.trim().normalize("NFC"))||null,y=((i=(a=r.title)==null?void 0:a.english)==null?void 0:i.trim().normalize("NFC"))||null,g=((T=(u=r.title)==null?void 0:u.native)==null?void 0:T.trim().normalize("NFC"))||null,L=new Set,S=[];for(const E of[d,y,g,...r.synonyms||[]]){if(typeof E!="string")continue;const v=E.normalize("NFC").trim().replace(/\s+/g," ").slice(0,180),P=v.toLocaleLowerCase("vi");if(!(!v||L.has(P))&&(L.add(P),S.push(v),S.length>=12))break}w.push({anilistId:r.id,primaryTitle:d||y||g||"Light Novel",titles:{romaji:d,english:y,native:g},altTitles:S,author:D(r),description:R(r.description),mappedTags:I(r),volumes:typeof r.volumes=="number"&&r.volumes>0?r.volumes:null,year:typeof((A=r.startDate)==null?void 0:A.year)=="number"&&r.startDate.year>0?r.startDate.year:null,status:typeof r.status=="string"?r.status:null})}return w}finally{window.clearTimeout(p),o==null||o.removeEventListener("abort",t)}}export{O as searchAniListDirectBrowser};
