export const TOPICS = [
  {id:'genai',name:'Generative AI',cat:'Technology',vol:5100000,reach:38700000,growth:94,
   desc:'Large language models, image generators and code assistants — the defining tech narrative across urban India. X and Reddit carry most of the discussion, with strong pockets in Bengaluru, Hyderabad and Delhi.',
   emo:{excitement:34,supportive:22,anxiety:17,sarcasm:12,against:9,neutral:6},
   kw:['agentic workflows','GPU import duty','prompt engineer salary','on-device models','AI in campus placements'],
   hubs:['Karnataka','Telangana','Maharashtra','Delhi'],
   events:[{at:.42,t:'Bengaluru dev meetup thread',v:'41K mentions/hr'},{at:.78,t:'Pricing change announcement',v:'63K mentions/hr'}],
   q: 'generative ai', label: 'generative ai', mentions: '5.1M',
   shape: [62, 58, 55, 48, 30, 26, 34, 52, 70, 78],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Thread on agentic workflows crosses 4.1K quote posts in six hours', ago: '2 hours ago', tag: 'X' },
     { src: 'Reddit', c: '#ff4500', t: 'r/developersIndia megathread: has AI changed your placement prep?', ago: '5 hours ago', tag: 'RD' },
     { src: 'Telegram', c: '#0088cc', t: 'Bengaluru dev channel forwards pricing-change post to 190 groups', ago: '8 hours ago', tag: 'TG' }]
  },
  {id:'upsc',name:'UPSC 2026 prep',cat:'Education',vol:2800000,reach:21400000,growth:212,
   desc:'Notification dates, mock series and coaching-fee complaints dominate aspirant channels this window, concentrated in Uttar Pradesh, Bihar and Delhi.',
   emo:{anxiety:31,supportive:24,excitement:16,neutral:14,sarcasm:9,against:6},
   kw:['prelims date shift','optional subject swap','free mock series','Delhi coaching fees','answer key row'],
   hubs:['Uttar Pradesh','Bihar','Rajasthan','Delhi'],
   events:[{at:.35,t:'Notification date leak',v:'28K mentions/hr'},{at:.88,t:'Result thread',v:'52K mentions/hr'}],
   q: 'upsc 2026 prep', label: 'upsc 2026 prep', mentions: '2.8M',
   shape: [50, 52, 56, 60, 45, 22, 18, 30, 42, 46],
   posts: [
     { src: 'Telegram', c: '#0088cc', t: 'Notification date screenshot forwarded across 340 aspirant channels', ago: '4 hours ago', tag: 'TG' },
     { src: 'X (Twitter)', c: '#000000', t: 'Answer-key dispute becomes the day\'s most-replied education thread', ago: '7 hours ago', tag: 'X' },
     { src: 'Reddit', c: '#ff4500', t: 'Free mock-series drop draws 1.2K comments in one evening', ago: '11 hours ago', tag: 'RD' }]
  },
  {id:'escoot',name:'Electric two-wheelers',cat:'Auto',vol:1940000,reach:14200000,growth:57,
   desc:'Charging access and a subsidy circular are driving most of the conversation, led by Maharashtra and Gujarat riders.',
   emo:{excitement:27,supportive:21,against:18,anxiety:15,sarcasm:12,neutral:7},
   kw:['charging near me','battery swap pilot','subsidy rollback','service centre wait','range in monsoon'],
   hubs:['Maharashtra','Gujarat','Tamil Nadu','Karnataka'],
   events:[{at:.55,t:'Subsidy circular',v:'19K mentions/hr'}],
   q: 'electric two-wheelers', label: 'electric two-wheelers', mentions: '1.9M',
   shape: [40, 45, 50, 60, 55, 45, 35, 30, 40, 48],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Subsidy rollback thread sees 20K mentions from prospective buyers', ago: '4 hours ago', tag: 'X' },
     { src: 'YouTube', c: '#ff0000', t: 'Reviewer video explains charging constraints in heavy rain', ago: '8 hours ago', tag: 'YT' }
   ]
  },
  {id:'ipl',name:'IPL auction buzz',cat:'Sports',vol:4300000,reach:52100000,growth:265,
   desc:'Retention lists, marquee-lot bidding and captaincy speculation are driving explosive short-term volume, concentrated in Mumbai, Chennai, Kolkata and Bengaluru fan hubs.',
   emo:{excitement:41,supportive:18,sarcasm:19,anxiety:9,against:7,neutral:6},
   kw:['retention list leak','marquee lot price','captaincy rumour','auction purse cap','impact player rule'],
   hubs:['Maharashtra','Tamil Nadu','West Bengal','Karnataka'],
   events:[{at:.2,t:'Retention list leak',v:'88K mentions/hr'},{at:.7,t:'Auction day live bidding',v:'132K mentions/hr'}],
   q: 'ipl auction buzz', label: 'ipl auction buzz', mentions: '4.3M',
   shape: [70, 66, 60, 40, 14, 20, 38, 44, 52, 58],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Retention list leak spikes to 88K mentions an hour before confirmation', ago: '1 hour ago', tag: 'X' },
     { src: 'Instagram', c: '#c13584', t: 'Fan-edit reel on the captaincy rumour passes 2.4M plays', ago: '3 hours ago', tag: 'IG' },
     { src: 'YouTube', c: '#ff0000', t: 'Comment sections on auction previews skew sarcastic, 19% of replies', ago: '6 hours ago', tag: 'YT' }]
  },
  {id:'monsoon',name:'Monsoon flooding',cat:'Weather & Civic',vol:2600000,reach:30800000,growth:181,
   desc:'Relief-camp coordination, IMD alerts and waterlogging complaints are spiking across flood-hit districts, led by Assam, Maharashtra, Kerala and Bihar.',
   emo:{anxiety:33,supportive:26,against:21,sarcasm:8,neutral:8,excitement:4},
   kw:['relief camp list','IMD red alert','waterlogging complaint','boat rescue request','flood relief fund'],
   hubs:['Assam','Maharashtra','Kerala','Bihar'],
   events:[{at:.15,t:'IMD red alert issued',v:'71K mentions/hr'},{at:.55,t:'Relief-camp list shared',v:'61K mentions/hr'}],
   q: 'monsoon flooding', label: 'monsoon flooding', mentions: '2.6M',
   shape: [72, 68, 58, 44, 26, 16, 24, 36, 40, 48],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Relief-camp list gets pinned and shared 61K times across districts', ago: '40 minutes ago', tag: 'X' },
     { src: 'Facebook', c: '#1877f2', t: 'District groups coordinate boat requests through comment threads', ago: '2 hours ago', tag: 'FB' },
     { src: 'Telegram', c: '#0088cc', t: 'IMD red alert forwarded to 1.1M subscribers within nine minutes', ago: '5 hours ago', tag: 'TG' }]
  },
  {id:'creator',name:'Creator monetisation',cat:'Media & Creators',vol:1400000,reach:18200000,growth:72,
   desc:'A payout-structure change is reshaping how regional-language creators talk about brand deals and platform trust, concentrated in Maharashtra, Uttar Pradesh and Tamil Nadu.',
   emo:{against:23,sarcasm:20,supportive:19,anxiety:16,excitement:14,neutral:8},
   kw:['payout change','rate card leak','brand deal pricing','watch-time shift','platform trust'],
   hubs:['Maharashtra','Uttar Pradesh','Tamil Nadu','Delhi'],
   events:[{at:.3,t:'Payout-change post goes viral',v:'26K mentions/hr'},{at:.8,t:'Rate-card spreadsheet shared',v:'34K mentions/hr'}],
   q: 'creator monetisation', label: 'creator monetisation', mentions: '1.4M',
   shape: [44, 46, 50, 54, 58, 40, 24, 28, 38, 42],
   posts: [
     { src: 'Instagram', c: '#c13584', t: 'Payout-change post pulls 38K saves from regional-language creators', ago: '3 hours ago', tag: 'IG' },
     { src: 'X (Twitter)', c: '#000000', t: 'Rate-card spreadsheet goes around, brand-deal pricing debate follows', ago: '6 hours ago', tag: 'X' },
     { src: 'YouTube', c: '#ff0000', t: 'Watch-time shift dominates comments on creator-economy explainers', ago: '9 hours ago', tag: 'YT' }]
  }
];

export const C = {blue:'#1a73e8',green:'#34a853',yellow:'#fbbc04',red:'#ea4335',purple:'#a142f4',grey:'#9aa0a6',teal:'#12b5cb'};
export const EMO=[
  {k:'excitement',label:'Excitement',c:C.green},{k:'supportive',label:'Supportive',c:C.teal},
  {k:'anxiety',label:'Anxiety',c:C.yellow},{k:'sarcasm',label:'Sarcasm',c:C.purple},
  {k:'against',label:'Against',c:C.red},{k:'neutral',label:'Neutral',c:C.grey}
];

export const QUOTE: Record<string, string>={
  excitement:'this actually changes how we ship — trying it tonight',
  supportive:'sharing the helpline numbers in the replies, please use them',
  anxiety:'three months of savings left and no callbacks yet',
  sarcasm:'sure, another revolution, my 8th this quarter',
  against:'roll it back until someone explains who pays for it',
  neutral:'official circular is on the department site, link below'
};

export const STATES=[
  ['Ladakh','LDK',4,0],['Jammu & Kashmir','J&K',3,1],['Himachal','HP',4,1],['Uttarakhand','UK',5,1],
  ['Punjab','PB',3,2],['Haryana','HR',4,2],['Delhi','DL',5,2],['Sikkim','SK',8,2],['Arunachal','AR',10,2],
  ['Rajasthan','RJ',2,3],['Uttar Pradesh','UP',5,3],['Bihar','BR',7,3],['Assam','AS',9,3],['Nagaland','NL',10,3],
  ['Gujarat','GJ',2,4],['Madhya Pradesh','MP',4,4],['Jharkhand','JH',7,4],['West Bengal','WB',8,4],['Meghalaya','ML',9,4],['Manipur','MN',10,4],
  ['Maharashtra','MH',3,5],['Chhattisgarh','CG',5,5],['Odisha','OD',7,5],['Tripura','TR',9,5],['Mizoram','MZ',10,5],
  ['Goa','GA',2,6],['Telangana','TS',4,6],['Andhra Pradesh','AP',6,6],
  ['Karnataka','KA',3,7],['Tamil Nadu','TN',5,7],['Andaman','AN',9,7],
  ['Kerala','KL',4,8]
];

export const RANGES=[{id:'6H',label:'6H',n:24,step:'15 min'},{id:'1D',label:'1D',n:24,step:'hourly'},{id:'7D',label:'7D',n:28,step:'6 hourly'},{id:'30D',label:'30D',n:30,step:'daily'}];
export const REGIONS=['All India','North','West','South','East & North-East'];
export const REGION_OF: Record<string, string>={'Ladakh':'North','Jammu & Kashmir':'North','Himachal':'North','Uttarakhand':'North','Punjab':'North','Haryana':'North','Delhi':'North','Rajasthan':'North','Uttar Pradesh':'North',
  'Gujarat':'West','Madhya Pradesh':'West','Maharashtra':'West','Goa':'West','Chhattisgarh':'West',
  'Telangana':'South','Andhra Pradesh':'South','Karnataka':'South','Tamil Nadu':'South','Kerala':'South','Andaman':'South',
  'Bihar':'East & North-East','Jharkhand':'East & North-East','West Bengal':'East & North-East','Odisha':'East & North-East','Assam':'East & North-East','Sikkim':'East & North-East','Arunachal':'East & North-East','Nagaland':'East & North-East','Meghalaya':'East & North-East','Manipur':'East & North-East','Tripura':'East & North-East','Mizoram':'East & North-East'};

export const fmt = (n: number) => n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1e3 ? (n/1e3).toFixed(1)+'K' : Math.round(n);
export function rng(seed: number){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function hash(s: string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export const lerpColor=(t: number)=>{const a=[232,240,254],b=[26,115,232];return`rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;};

export function seriesFor(t: any, range: string, region: string, seedMod: string = ''){
  const R = RANGES.find(r=>r.id===range)!, n=R.n, fc=6;
  const r = rng(hash(t.id+range+region+seedMod));
  const out=[];let base=28+r()*22;
  for(let i=0;i<n+fc;i++){
    const p=i/(n-1);
    base+= (t.growth/100)*(1.1+r()*1.4) - 0.6 + Math.sin(p*7+hash(t.id+seedMod)%6)*1.6;
    let v=base+r()*9-4;
    t.events.forEach((e: any)=>{const d=Math.abs(p-e.at);if(d<.06)v+=34*(1-d/.06);});
    out.push(Math.max(4,v));
  }
  const mx=Math.max(...out);
  const scale = seedMod ? 0.3 + (hash(seedMod) % 65)/100 : 1;
  return out.map(v=>Math.min(100,(v/mx*100) * scale));
}

export function stateScore(t: any, name: string){
  const h=hash(t.id+name)/4294967296;
  let v=22+h*58;
  if(t.hubs.includes(name)) v=76+h*24;
  return Math.round(Math.min(100,v));
}

export function regionFactor(t: any, state: string | null, region: string){
  if(state) return stateScore(t,state)/100*0.34;
  if(region==='All India') return 1;
  const share = {'North':.26,'West':.24,'South':.31,'East & North-East':.19}[region] || 1;
  const boost = t.hubs.some((h: string)=>REGION_OF[h]===region)?1.35:.8;
  return share*boost;
}

export const volOf = (t: any, state: string | null, region: string) => t.vol*regionFactor(t, state, region);
export const reachOf = (t: any, state: string | null, region: string) => t.reach*regionFactor(t, state, region);

export function wavePath(s: number[]) {
  const n = s.length, X = (i2: number) => i2 / (n - 1) * 1000;
  let d = `M0,${s[0] * 4}`;
  for (let k = 1; k < n; k++) {
    const cx = (X(k - 1) + X(k)) / 2;
    d += ` C${cx},${s[k - 1] * 4} ${cx},${s[k] * 4} ${X(k)},${s[k] * 4}`;
  }
  return d;
}
