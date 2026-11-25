import{P as N}from"./shelfTagPresets-CZyqeuQr.js";import"./index-LTVLU6IM.js";const b="https://graphql.anilist.co",H=6e3,M=45,P=new Set(N),C={action:"Action",adventure:"Adventure",comedy:"Comedy","dark fantasy":"Dark Fantasy",drama:"Drama",ecchi:"Ecchi",fantasy:"Fantasy","female protagonist":"Female Protagonist","video games":"Game","virtual world":"Game","full dive":"Game",game:"Game",harem:"Harem","female harem":"Harem","male harem":"Harem","mixed gender harem":"Harem",iyashikei:"Healing",healing:"Healing",historical:"Historical",horror:"Horror",isekai:"Isekai",magic:"Magic","martial arts":"Martial Arts",mecha:"Mecha",military:"Military",mystery:"Mystery","post-apocalyptic":"Post-Apocalyptic",psychological:"Psychological",romance:"Romance",school:"School Life","school life":"School Life","sci-fi":"Sci-Fi",seinen:"Seinen",shoujo:"Shoujo",shounen:"Shounen","slice of life":"Slice of Life","slow life":"Slow Life",sports:"Sports","super power":"Super Power",supernatural:"Supernatural",tragedy:"Tragedy",tsundere:"Tsundere",yandere:"Yandere",yuri:"Yuri","girls' love":"Yuri"},F=`
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
}`;function _(o){if(!o)return null;const a=o.replace(/~![\s\S]*?!~/g,"").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p\s*>/gi,`

`).replace(/<[^>]+>/g,""),e=(new DOMParser().parseFromString(a,"text/html").body.textContent||"").replace(/\r\n?/g,`
`).replace(/\n*\s*(?:\(Source:[^)\n]+\)|\[Written by[^\]]+\])\s*$/gi,"").replace(/\n{3,}/g,`

`).trim().normalize("NFC");return e?e.length>2500?`${e.slice(0,2499).trim()}…`:e:null}function k(o){var r,e,s,l,c,m,u;let a=null;for(const n of((r=o.staff)==null?void 0:r.edges)||[]){const i=((l=(s=(e=n==null?void 0:n.node)==null?void 0:e.name)==null?void 0:s.full)==null?void 0:l.trim())||((u=(m=(c=n==null?void 0:n.node)==null?void 0:c.name)==null?void 0:m.native)==null?void 0:u.trim())||"";if(!i)continue;const p=((n==null?void 0:n.role)||"").toLowerCase();if(/story|author|original|writer|creator/.test(p))return i.normalize("NFC");!/art|illustrat|design/.test(p)&&!a&&(a=i.normalize("NFC"))}return a}function R(o){const a=new Set(["Light Novel"]);o.isAdult&&a.add("18+");for(const r of o.genres||[]){const e=r?C[r.trim().toLowerCase()]:void 0;e&&P.has(e)&&a.add(e)}for(const r of o.tags||[]){if(!(r!=null&&r.name)||r.isMediaSpoiler||r.isGeneralSpoiler||Number(r.rank??0)<M)continue;const e=C[r.name.trim().toLowerCase()];e&&P.has(e)&&a.add(e)}return Array.from(a).slice(0,16)}async function G(o){var e,s,l,c,m,u,n,i,p;const a=new AbortController,r=window.setTimeout(()=>a.abort(),H);try{const f=await fetch(b,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query:F,variables:{search:o,perPage:6}}),signal:a.signal});if(!f.ok)throw new Error(`AniList tạm thời bận (HTTP ${f.status}). Bạn vẫn có thể nhập thủ công.`);const h=await f.json().catch(()=>null),E=((s=(e=h==null?void 0:h.data)==null?void 0:e.Page)==null?void 0:s.media)||[],w=[];for(const t of E){if(!t||typeof t.id!="number")continue;const g=((c=(l=t.title)==null?void 0:l.romaji)==null?void 0:c.trim().normalize("NFC"))||null,d=((u=(m=t.title)==null?void 0:m.english)==null?void 0:u.trim().normalize("NFC"))||null,y=((i=(n=t.title)==null?void 0:n.native)==null?void 0:i.trim().normalize("NFC"))||null,A=new Set,S=[];for(const v of[g,d,y,...t.synonyms||[]]){if(typeof v!="string")continue;const T=v.normalize("NFC").trim().replace(/\s+/g," ").slice(0,180),L=T.toLocaleLowerCase("vi");if(!(!T||A.has(L))&&(A.add(L),S.push(T),S.length>=12))break}w.push({anilistId:t.id,primaryTitle:g||d||y||"Light Novel",titles:{romaji:g,english:d,native:y},altTitles:S,author:k(t),description:_(t.description),mappedTags:R(t),volumes:typeof t.volumes=="number"&&t.volumes>0?t.volumes:null,year:typeof((p=t.startDate)==null?void 0:p.year)=="number"&&t.startDate.year>0?t.startDate.year:null,status:typeof t.status=="string"?t.status:null})}return w}finally{window.clearTimeout(r)}}export{G as searchAniListDirectBrowser};
