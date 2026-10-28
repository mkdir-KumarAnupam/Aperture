import { Narrative } from "./types";

export const TOPICS = [
  {id:'genai',name:'Generative AI',cat:'Technology',vol:5100000,reach:38700000,growth:94,
   desc:'Large language models, image generators and code assistants — the defining tech narrative across urban India. X and Reddit carry most of the discussion, with strong pockets in Bengaluru, Hyderabad and Delhi.',
   emo:{excitement:34,supportive:22,anxiety:17,sarcasm:12,against:9,neutral:6},
   kw:['agentic workflows','GPU import duty','prompt engineer salary','on-device models','AI in campus placements'],
   hubs:['Karnataka','Telangana','Maharashtra','Delhi'],
   events:[{at:.42,t:'Bengaluru dev meetup thread',v:'41K mentions/hr'},{at:.78,t:'Pricing change announcement',v:'63K mentions/hr'}],
   q: 'generative ai', label: 'generative ai', mentions: '5.1M',
   shape: [62, 58, 55, 48, 30, 26, 34, 52, 70, 78],
   narratives: [
     {
       id: "genai-1",
       title: "Agentic workflows & local LLMs",
       description: "Developers in Bengaluru and Hyderabad embracing open-source agentic loops, quantized weights, and local code assistants to bypass cloud API latency and recurring billing.",
       assignedPostsCount: 24000,
       activitySeries: [18, 22, 26, 30, 36, 44, 52, 60, 68, 76, 84, 91, 95, 92, 88, 85, 82, 79, 76, 72],
       sentiment: "Positive",
       growth: 135,
       updatedAt: "2026-10-22T15:30:00Z",
       platforms: [
         { platform: "X", count: 13000 },
         { platform: "Reddit", count: 7500 },
         { platform: "Telegram", count: 3500 }
       ],
       posts: [
         { id: "genai-p1", platform: "X", author: "@dev_bengaluru", text: "Switched our entire internal sprint workflow to autonomous agent loops running local quantized weights. Zero API bills and 10x faster iteration.", timestamp: "1h ago", likes: "1.8K", reposts: "420" },
         { id: "genai-p2", platform: "Reddit", author: "u/tensor_flow_guy", text: "r/developersIndia guide: Running 8B models locally on M-series MacBooks for full code completion privacy.", timestamp: "3h ago", likes: "940", reposts: "110" },
         { id: "genai-p3", platform: "Telegram", author: "AI Founders Hub", text: "Agentic workflow toolkit repo crossed 10K stars. Benchmarks comparing local agents vs cloud APIs pinned in the channel.", timestamp: "5h ago", likes: "2.6K" }
       ]
     },
     {
       id: "genai-2",
       title: "Fresher hiring slowdown",
       description: "Engineering college graduates and placement coordinators sounding alarms over IT services firms freezing fresher intakes as AI coding tools boost senior engineer output.",
       assignedPostsCount: 19000,
       activitySeries: [22, 30, 42, 58, 70, 65, 58, 52, 48, 44, 40, 37, 34, 31, 28, 26, 24, 22, 20, 18],
       sentiment: "Negative",
       growth: 48,
       updatedAt: "2026-10-22T14:15:00Z",
       platforms: [
         { platform: "Reddit", count: 10000 },
         { platform: "X", count: 6500 },
         { platform: "Telegram", count: 2500 }
       ],
       posts: [
         { id: "genai-p4", platform: "Reddit", author: "u/freshgrad_2026", text: "Mass hiring drives down 40% across tier-2 colleges. Recruiters are openly asking candidates to live-debug AI-generated code instead of writing DSA from scratch.", timestamp: "2h ago", likes: "3.2K", reposts: "540" },
         { id: "genai-p5", platform: "X", author: "@tech_recruiter_delhi", text: "We no longer hire 5 junior analysts to write boilerplate tests. One senior with cursor rules writes and deploys the entire suite in half a day.", timestamp: "4h ago", likes: "1.5K", reposts: "380" }
       ]
     },
     {
       id: "genai-3",
       title: "High GPU import tariffs",
       description: "Founders and deep tech researchers petitioning for zero-duty clearance on imported AI accelerator server clusters and subsidized sovereign compute capacity.",
       assignedPostsCount: 15000,
       activitySeries: [14, 18, 24, 32, 45, 56, 68, 76, 82, 80, 75, 71, 67, 63, 59, 55, 52, 48, 45, 42],
       sentiment: "Negative",
       growth: 72,
       updatedAt: "2026-10-22T13:40:00Z",
       platforms: [
         { platform: "X", count: 9000 },
         { platform: "Reddit", count: 4500 },
         { platform: "Telegram", count: 1500 }
       ],
       posts: [
         { id: "genai-p6", platform: "X", author: "@harish_hardware", text: "Why are high-end server accelerators still taxed under luxury duty brackets? AI hardware founders are flying to Dubai and Singapore just to access GPU clusters.", timestamp: "2h ago", likes: "2.9K", reposts: "840" },
         { id: "genai-p7", platform: "Reddit", author: "u/silicon_valley_desi", text: "Clearing an 8x H100 node through Indian customs took 7 weeks of bureaucratic documentation and nearly doubled the total landing cost.", timestamp: "5h ago", likes: "1.1K" }
       ]
     },
     {
       id: "genai-4",
       title: "Indic benchmark accuracy debate",
       description: "Linguistic researchers questioning the real-world utility of Hindi, Tamil, and Bengali foundation models plagued by synthetic dataset hallucinations and token bloat.",
       assignedPostsCount: 11000,
       activitySeries: [12, 15, 19, 24, 30, 36, 44, 52, 60, 68, 74, 80, 84, 86, 83, 79, 75, 71, 68, 64],
       sentiment: "Uncertain",
       growth: 85,
       updatedAt: "2026-10-22T11:50:00Z",
       platforms: [
         { platform: "X", count: 5500 },
         { platform: "Reddit", count: 3500 },
         { platform: "Telegram", count: 2000 }
       ],
       posts: [
         { id: "genai-p8", platform: "X", author: "@lingua_tech", text: "Testing open Indic LLMs on district court legal filings in Kannada. Token fertility rate is 4x worse than English, making regional inferencing prohibitively slow and expensive.", timestamp: "4h ago", likes: "1.7K", reposts: "490" },
         { id: "genai-p9", platform: "Telegram", author: "Indic AI Research Group", text: "Published comprehensive evaluation paper on vernacular reasoning benchmarks. Thread on methodology open for feedback.", timestamp: "6h ago", likes: "3.1K" }
       ]
     },
     {
       id: "genai-5",
       title: "Prompt engineer salary cooling",
       description: "Industry sentiment pivoting from superficial prompt certifications toward verifiable systems engineering, model fine-tuning, and RAG architectures.",
       assignedPostsCount: 8500,
       activitySeries: [10, 13, 17, 22, 28, 35, 42, 50, 60, 72, 78, 85, 90, 88, 84, 80, 76, 72, 68, 64],
       sentiment: "Positive",
       growth: 105,
       updatedAt: "2026-10-22T09:25:00Z",
       platforms: [
         { platform: "Reddit", count: 4800 },
         { platform: "X", count: 2700 },
         { platform: "Telegram", count: 1000 }
       ],
       posts: [
         { id: "genai-p10", platform: "Reddit", author: "u/ml_infra_lead", text: "The ₹30 LPA prompt engineer job listings were all marketing stunts. Real engineering teams are hiring distributed systems and vector database architects.", timestamp: "7h ago", likes: "2.1K" },
         { id: "genai-p11", platform: "X", author: "@bengaluru_tech_pulse", text: "Shift your focus from clever prompt tricks to agentic loops and evaluation pipelines. The skill ceiling has dramatically moved upwards.", timestamp: "8h ago", likes: "1.3K", reposts: "260" }
       ]
     }
   ],
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
   narratives: [
     {
       id: "upsc-1",
       title: "Prelims clash date shift",
       description: "Aspirants petitioning UPSC to resolve direct scheduling conflicts with UPPSC and BPSC exams causing travel and exam logistics chaos.",
       assignedPostsCount: 34000,
       activitySeries: [20, 24, 30, 36, 45, 58, 68, 79, 86, 92, 95, 98, 94, 90, 85, 80, 77, 74, 70, 66],
       sentiment: "Negative",
       growth: 195,
       updatedAt: "2026-10-22T16:20:00Z",
       platforms: [
         { platform: "X", count: 16000 },
         { platform: "Telegram", count: 12000 },
         { platform: "Reddit", count: 6000 }
       ],
       posts: [
         { id: "upsc-p1", platform: "X", author: "@aspirant_union_in", text: "Having UPPSC Mains and UPSC Prelims mock dates in the exact same 48-hour window is impossible for outstation candidates. Shift requested.", timestamp: "1h ago", likes: "4.2K", reposts: "1.1K" },
         { id: "upsc-p2", platform: "Telegram", author: "Delhi UPSC Hub", text: "Representation draft submitted to department joint secretary. Copy circulated in district channels.", timestamp: "3h ago", likes: "6.8K" }
       ]
     },
     {
       id: "upsc-2",
       title: "Free topper mock series",
       description: "Massive community adoption of open-source model test papers and Telegram peer-review evaluation channels across Hindi and English mediums.",
       assignedPostsCount: 26000,
       activitySeries: [12, 16, 22, 28, 35, 42, 50, 58, 65, 72, 80, 86, 92, 94, 91, 88, 85, 82, 79, 75],
       sentiment: "Positive",
       growth: 160,
       updatedAt: "2026-10-22T14:40:00Z",
       platforms: [
         { platform: "Telegram", count: 15000 },
         { platform: "Reddit", count: 7000 },
         { platform: "X", count: 4000 }
       ],
       posts: [
         { id: "upsc-p3", platform: "Reddit", author: "u/civil_servant_aspirant", text: "Crowdsourced answer evaluation sheet with 12 selected rankers reviewing daily GS answers for free. True game changer.", timestamp: "4h ago", likes: "1.9K" },
         { id: "upsc-p4", platform: "Telegram", author: "Ethics 120+ Channel", text: "Full length mock test 4 PDF with model answers uploaded. 82K downloads in first 3 hours.", timestamp: "5h ago", likes: "5.4K" }
       ]
     },
     {
       id: "upsc-3",
       title: "Mukherjee Nagar rent inflation",
       description: "Protests against commercial coaching conglomerates and landlords charging ₹18,000+ per month for windowless shared cubicles.",
       assignedPostsCount: 19000,
       activitySeries: [15, 20, 29, 45, 60, 72, 68, 62, 55, 50, 45, 40, 38, 35, 32, 30, 28, 25, 23, 20],
       sentiment: "Negative",
       growth: 85,
       updatedAt: "2026-10-22T13:15:00Z",
       platforms: [
         { platform: "X", count: 10000 },
         { platform: "Reddit", count: 5000 },
         { platform: "Telegram", count: 4000 }
       ],
       posts: [
         { id: "upsc-p5", platform: "X", author: "@mukherjee_nagar_voices", text: "Library desk charges went from ₹1,800 to ₹3,200/month with zero ventilation. Middle-class parents are taking emergency personal loans.", timestamp: "2h ago", likes: "3.7K", reposts: "940" }
       ]
     },
     {
       id: "upsc-4",
       title: "Optional syllabus change row",
       description: "Speculation over proposed reductions in history and sociology syllabus modules ahead of the official UPSC annual notification.",
       assignedPostsCount: 13000,
       activitySeries: [14, 17, 21, 26, 32, 38, 44, 49, 55, 62, 67, 72, 76, 78, 80, 77, 73, 70, 66, 62],
       sentiment: "Uncertain",
       growth: 72,
       updatedAt: "2026-10-22T11:50:00Z",
       platforms: [
         { platform: "Telegram", count: 7000 },
         { platform: "Reddit", count: 4000 },
         { platform: "X", count: 2000 }
       ],
       posts: [
         { id: "upsc-p6", platform: "Telegram", author: "Sociology Optional Forum", text: "Unverified circular claims Section B Thinkers list will be trimmed. Awaiting official gazette before changing study notes.", timestamp: "6h ago", likes: "2.8K" }
       ]
     },
     {
       id: "upsc-5",
       title: "CSAT answer key petitions",
       description: "Student associations filing court representations demanding transparent normalization and prompt dispute redressal for tricky aptitude questions.",
       assignedPostsCount: 9000,
       activitySeries: [10, 14, 20, 28, 40, 54, 68, 76, 82, 79, 74, 68, 62, 56, 50, 45, 41, 38, 35, 32],
       sentiment: "Negative",
       growth: 110,
       updatedAt: "2026-10-22T09:30:00Z",
       platforms: [
         { platform: "X", count: 5500 },
         { platform: "Telegram", count: 2500 },
         { platform: "Reddit", count: 1000 }
       ],
       posts: [
         { id: "upsc-p7", platform: "X", author: "@advocate_student_rights", text: "High Court writ filed regarding 3 factual errors in the official CSAT answer key. Independent expert panel demanded.", timestamp: "8h ago", likes: "2.9K", reposts: "720" }
       ]
     }
   ],
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
   narratives: [
     {
       id: "escoot-1",
       title: "Subsidy rollback price spike",
       description: "Buyer hesitation as revised government subsidy slabs add ₹16,000–₹22,000 to popular electric commuter models overnight.",
       assignedPostsCount: 31000,
       activitySeries: [18, 26, 38, 55, 72, 84, 80, 75, 68, 62, 56, 50, 46, 42, 38, 35, 32, 29, 27, 24],
       sentiment: "Negative",
       growth: 125,
       updatedAt: "2026-10-22T15:10:00Z",
       platforms: [
         { platform: "X", count: 16000 },
         { platform: "Reddit", count: 10000 },
         { platform: "Telegram", count: 5000 }
       ],
       posts: [
         { id: "escoot-p1", platform: "X", author: "@ev_pune_rider", text: "Walked into dealership today and the base model is now ₹1.48L on road. Petrol Activa is looking sensible again.", timestamp: "2h ago", likes: "2.4K", reposts: "530" },
         { id: "escoot-p2", platform: "Reddit", author: "u/bangalore_auto_guy", text: "Cancellation wave hitting showrooms after the central circular slashed direct subsidies.", timestamp: "4h ago", likes: "1.1K" }
       ]
     },
     {
       id: "escoot-2",
       title: "Highway battery swap expansion",
       description: "Delivery riders and commuters praising 90-second automated pack swaps across Mumbai-Pune and Ahmedabad routes.",
       assignedPostsCount: 24000,
       activitySeries: [10, 14, 20, 28, 36, 46, 55, 64, 74, 82, 89, 95, 92, 88, 85, 81, 78, 74, 71, 68],
       sentiment: "Positive",
       growth: 140,
       updatedAt: "2026-10-22T14:00:00Z",
       platforms: [
         { platform: "Telegram", count: 11000 },
         { platform: "Reddit", count: 8000 },
         { platform: "X", count: 5000 }
       ],
       posts: [
         { id: "escoot-p3", platform: "Telegram", author: "Swapping Network Intel", text: "New automated swap kiosk live at Turbhe toll plaza. Average dwell time measured under 95 seconds.", timestamp: "3h ago", likes: "3.2K" }
       ]
     },
     {
       id: "escoot-3",
       title: "Monsoon water-wading safety",
       description: "Owners debating IP67 immersion ratings after BMS sensors triggered emergency limp-home mode in flooded streets.",
       assignedPostsCount: 17000,
       activitySeries: [16, 18, 22, 27, 33, 40, 48, 56, 64, 70, 76, 79, 82, 80, 77, 74, 71, 67, 64, 60],
       sentiment: "Uncertain",
       growth: 68,
       updatedAt: "2026-10-22T12:20:00Z",
       platforms: [
         { platform: "Reddit", count: 9000 },
         { platform: "X", count: 5000 },
         { platform: "Telegram", count: 3000 }
       ],
       posts: [
         { id: "escoot-p4", platform: "Reddit", author: "u/mumbai_waterlogged", text: "Water touched the floorboard on Western Express and the screen threw error code 42. Is it safe to charge once dry?", timestamp: "5h ago", likes: "840" }
       ]
     },
     {
       id: "escoot-4",
       title: "75% commuter fuel savings",
       description: "Widespread sharing of monthly home-charging utility bills proving break-even achieved within 18 months despite purchase price.",
       assignedPostsCount: 12000,
       activitySeries: [12, 15, 20, 26, 33, 41, 50, 58, 67, 75, 82, 88, 90, 87, 84, 80, 76, 73, 69, 65],
       sentiment: "Positive",
       growth: 82,
       updatedAt: "2026-10-22T10:45:00Z",
       platforms: [
         { platform: "Reddit", count: 7000 },
         { platform: "X", count: 3500 },
         { platform: "Telegram", count: 1500 }
       ],
       posts: [
         { id: "escoot-p5", platform: "Reddit", author: "u/frugal_engineer_pune", text: "Commuting 38km every single day costs me ₹26 in power vs ₹150 in fuel. Saved ₹36,000 in Year 1.", timestamp: "7h ago", likes: "2.8K" }
       ]
     },
     {
       id: "escoot-5",
       title: "Service centre wait backlogs",
       description: "Complaints filed regarding authorized dealership bottlenecks, shortage of wire harnesses, and unresponsive roadside assistance.",
       assignedPostsCount: 7000,
       activitySeries: [14, 19, 27, 38, 52, 64, 70, 66, 60, 54, 48, 43, 38, 34, 31, 28, 25, 23, 21, 18],
       sentiment: "Negative",
       growth: 45,
       updatedAt: "2026-10-22T08:40:00Z",
       platforms: [
         { platform: "X", count: 4000 },
         { platform: "Reddit", count: 2200 },
         { platform: "Telegram", count: 800 }
       ],
       posts: [
         { id: "escoot-p6", platform: "X", author: "@ev_consumer_forum", text: "Third week my scooter has been stuck in service bay waiting on a throttle cable sensor. Customer care is entirely automated bots.", timestamp: "9h ago", likes: "1.2K", reposts: "380" }
       ]
     }
   ],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Subsidy rollback thread sees 20K mentions from prospective buyers', ago: '4 hours ago', tag: 'X' },
     { src: 'Telegram', c: '#0088cc', t: 'EV owners community shares real-world range logs and battery data', ago: '6 hours ago', tag: 'TG' },
     { src: 'Reddit', c: '#ff4500', t: 'r/indianbikes discussion on service center wait times and battery swaps', ago: '9 hours ago', tag: 'RD' }
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
   narratives: [
     {
       id: "ipl-1",
       title: "Franchise retention fallout",
       description: "Heated fan reactions to veteran international captains and franchise legends released into the open auction pool without farewell statements.",
       assignedPostsCount: 52000,
       activitySeries: [15, 18, 24, 32, 45, 60, 78, 92, 98, 100, 96, 91, 86, 82, 78, 74, 70, 67, 64, 60],
       sentiment: "Negative",
       growth: 245,
       updatedAt: "2026-10-22T16:30:00Z",
       platforms: [
         { platform: "X", count: 31000 },
         { platform: "Reddit", count: 14000 },
         { platform: "Telegram", count: 7000 }
       ],
       posts: [
         { id: "ipl-p1", platform: "X", author: "@mumbai_indians_army", text: "Releasing our 5-trophy winning core player after 11 seasons via a 2-line tweet is sheer disrespect. Boycotting stadium games.", timestamp: "1h ago", likes: "12.4K", reposts: "3.8K" },
         { id: "ipl-p2", platform: "Reddit", author: "u/ipl_tactics_nerd", text: "From a pure purse perspective it makes sense, but culturally this breaks the entire fan identity.", timestamp: "2h ago", likes: "4.2K" }
       ]
     },
     {
       id: "ipl-2",
       title: "Overseas pacer bidding war",
       description: "Auction analysts and fans predicting bids exceeding ₹20 Crore for match-winning death-over pacers and power hitters.",
       assignedPostsCount: 42000,
       activitySeries: [20, 26, 35, 48, 62, 75, 86, 94, 98, 95, 92, 88, 85, 81, 78, 75, 71, 68, 65, 62],
       sentiment: "Positive",
       growth: 290,
       updatedAt: "2026-10-22T15:00:00Z",
       platforms: [
         { platform: "X", count: 24000 },
         { platform: "Telegram", count: 12000 },
         { platform: "Reddit", count: 6000 }
       ],
       posts: [
         { id: "ipl-p3", platform: "Telegram", author: "Live Auction Alerts", text: "Three franchises enter the auction with ₹65Cr+ purse. Marquee set 1 is going to break all previous financial records.", timestamp: "3h ago", likes: "7.9K" }
       ]
     },
     {
       id: "ipl-3",
       title: "Captaincy trade rumours",
       description: "Intense speculation regarding behind-the-scenes trade negotiations, contract clauses, and captaincy handover demands.",
       assignedPostsCount: 28000,
       activitySeries: [16, 20, 26, 34, 44, 55, 68, 79, 86, 88, 85, 81, 77, 73, 69, 66, 62, 59, 56, 52],
       sentiment: "Uncertain",
       growth: 135,
       updatedAt: "2026-10-22T13:40:00Z",
       platforms: [
         { platform: "Telegram", count: 14000 },
         { platform: "X", count: 9000 },
         { platform: "Reddit", count: 5000 }
       ],
       posts: [
         { id: "ipl-p4", platform: "X", author: "@cric_wire", text: "Hearing that the trade negotiation stalled because player insisted on full captaincy veto over overseas picks.", timestamp: "4h ago", likes: "5.1K", reposts: "1.2K" }
       ]
     },
     {
       id: "ipl-4",
       title: "Impact Player rule debate",
       description: "Cricketing debate on how 8-batter lineups relieve top orders from bowling, suppressing multi-skill Indian prospects.",
       assignedPostsCount: 19000,
       activitySeries: [14, 18, 24, 32, 42, 52, 60, 68, 72, 70, 66, 62, 58, 54, 50, 46, 42, 39, 36, 33],
       sentiment: "Neutral",
       growth: 95,
       updatedAt: "2026-10-22T12:00:00Z",
       platforms: [
         { platform: "Reddit", count: 10000 },
         { platform: "X", count: 6000 },
         { platform: "Telegram", count: 3000 }
       ],
       posts: [
         { id: "ipl-p5", platform: "Reddit", author: "u/spin_and_swing", text: "Look at the Indian squad selections. We have zero top-order batsmen who can roll their arm over 2 overs anymore.", timestamp: "6h ago", likes: "3.6K" }
       ]
     },
     {
       id: "ipl-5",
       title: "Ticket pricing & scalping outcry",
       description: "Backlash over general stand seats marked up 300% on unauthorized secondary ticket platforms while official portals crash.",
       assignedPostsCount: 13000,
       activitySeries: [12, 16, 22, 30, 42, 56, 68, 74, 76, 72, 67, 62, 57, 52, 48, 44, 40, 37, 34, 30],
       sentiment: "Negative",
       growth: 78,
       updatedAt: "2026-10-22T09:15:00Z",
       platforms: [
         { platform: "X", count: 8000 },
         { platform: "Reddit", count: 3500 },
         { platform: "Telegram", count: 1500 }
       ],
       posts: [
         { id: "ipl-p6", platform: "X", author: "@rcb_fanatic_hub", text: "Waited in online queue for 45 mins. Sold out instantly, and ₹1,200 stand passes already listed on Viagogo for ₹6,500.", timestamp: "8h ago", likes: "6.2K", reposts: "1.7K" }
       ]
     }
   ],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Retention list leak spikes to 88K mentions an hour before confirmation', ago: '1 hour ago', tag: 'X' },
     { src: 'Telegram', c: '#0088cc', t: 'Auction alert channels share live marquee-bid breakdown to 450K fans', ago: '3 hours ago', tag: 'TG' },
     { src: 'Reddit', c: '#ff4500', t: 'r/Cricket megathread debates captaincy changes and auction purse limits', ago: '6 hours ago', tag: 'RD' }
   ]
  },
  {id:'monsoon',name:'Monsoon flooding',cat:'Weather & Civic',vol:2600000,reach:30800000,growth:181,
   desc:'Relief-camp coordination, IMD alerts and waterlogging complaints are spiking across flood-hit districts, led by Assam, Maharashtra, Kerala and Bihar.',
   emo:{anxiety:33,supportive:26,against:21,sarcasm:8,neutral:8,excitement:4},
   kw:['relief camp list','IMD red alert','waterlogging complaint','boat rescue request','flood relief fund'],
   hubs:['Assam','Maharashtra','Kerala','Bihar'],
   events:[{at:.15,t:'IMD red alert issued',v:'71K mentions/hr'},{at:.55,t:'Relief-camp list shared',v:'61K mentions/hr'}],
   q: 'monsoon flooding', label: 'monsoon flooding', mentions: '2.6M',
   shape: [72, 68, 58, 44, 26, 16, 24, 36, 40, 48],
   narratives: [
     {
       id: "monsoon-1",
       title: "Volunteer boat rescue SOS",
       description: "Citizen helplines and youth volunteer flotillas mobilizing verified rescue operations in cutoff riverine villages across Assam and Bihar.",
       assignedPostsCount: 46000,
       activitySeries: [25, 32, 42, 56, 70, 85, 94, 98, 96, 93, 89, 86, 82, 79, 76, 73, 70, 68, 65, 62],
       sentiment: "Positive",
       growth: 230,
       updatedAt: "2026-10-22T16:40:00Z",
       platforms: [
         { platform: "Telegram", count: 24000 },
         { platform: "X", count: 15000 },
         { platform: "Reddit", count: 7000 }
       ],
       posts: [
         { id: "monsoon-p1", platform: "Telegram", author: "Assam Flood Relief Desk", text: "SOS batch 14 evacuated 84 villagers from submerged island in Morigaon. Clean drinking water packets dispatched.", timestamp: "45m ago", likes: "9.3K" },
         { id: "monsoon-p2", platform: "X", author: "@guwahati_helpline", text: "Verified helpline numbers for livestock feed and medical kits in flood shelter clusters.", timestamp: "2h ago", likes: "3.4K", reposts: "1.8K" }
       ]
     },
     {
       id: "monsoon-2",
       title: "Drain desilting backlash",
       description: "Citizens sharing geo-tagged footage of clogged culverts that inundated arterial roads within 45 minutes of rainfall.",
       assignedPostsCount: 38000,
       activitySeries: [18, 25, 36, 52, 70, 84, 80, 74, 66, 60, 54, 48, 42, 38, 34, 30, 27, 24, 22, 19],
       sentiment: "Negative",
       growth: 165,
       updatedAt: "2026-10-22T15:20:00Z",
       platforms: [
         { platform: "X", count: 21000 },
         { platform: "Reddit", count: 11000 },
         { platform: "Telegram", count: 6000 }
       ],
       posts: [
         { id: "monsoon-p3", platform: "X", author: "@mumbai_citizen_forum", text: "BMC spent ₹240 Crore on pre-monsoon desilting tenders. SCLR and Sion Circle flooded on Day 1. Where did the money go?", timestamp: "1h ago", likes: "8.1K", reposts: "2.6K" }
       ]
     },
     {
       id: "monsoon-3",
       title: "IMD red alert transit halts",
       description: "Commuter anxiety over sudden localized cloudbursts clashing with delayed civic disaster management advisories and rail suspensions.",
       assignedPostsCount: 25000,
       activitySeries: [14, 18, 25, 34, 46, 58, 72, 82, 88, 85, 80, 75, 70, 65, 60, 55, 50, 46, 42, 38],
       sentiment: "Uncertain",
       growth: 110,
       updatedAt: "2026-10-22T13:30:00Z",
       platforms: [
         { platform: "Telegram", count: 13000 },
         { platform: "X", count: 8000 },
         { platform: "Reddit", count: 4000 }
       ],
       posts: [
         { id: "monsoon-p4", platform: "Telegram", author: "Mumbai Live Commute", text: "Central Line services crawling due to water accumulation between Kurla and Sion. Harbor Line halted.", timestamp: "3h ago", likes: "7.1K" }
       ]
     },
     {
       id: "monsoon-4",
       title: "Basement flooding insurance woes",
       description: "Residents struggling with damaged transformers, contaminated drinking tanks, and stalled vehicle insurance claim inspections.",
       assignedPostsCount: 18000,
       activitySeries: [12, 16, 22, 29, 38, 48, 58, 68, 76, 82, 80, 76, 72, 67, 63, 59, 55, 51, 47, 43],
       sentiment: "Negative",
       growth: 85,
       updatedAt: "2026-10-22T11:40:00Z",
       platforms: [
         { platform: "Reddit", count: 10000 },
         { platform: "Telegram", count: 5000 },
         { platform: "X", count: 3000 }
       ],
       posts: [
         { id: "monsoon-p5", platform: "Reddit", author: "u/kerala_flat_owner", text: "Basement water pump failed. 34 cars completely flooded to steering wheel level. Surveyors taking 10 days to even visit.", timestamp: "5h ago", likes: "2.3K" }
       ]
     },
     {
       id: "monsoon-5",
       title: "Fishermen & NDRF heroics",
       description: "Viral appreciation for traditional fishing boat operators evacuating stranded hospital patients and elderly citizens from flooded wards.",
       assignedPostsCount: 12000,
       activitySeries: [10, 14, 20, 28, 38, 50, 64, 76, 85, 90, 87, 83, 79, 74, 70, 66, 62, 58, 54, 50],
       sentiment: "Positive",
       growth: 140,
       updatedAt: "2026-10-22T09:50:00Z",
       platforms: [
         { platform: "X", count: 7000 },
         { platform: "Telegram", count: 3500 },
         { platform: "Reddit", count: 1500 }
       ],
       posts: [
         { id: "monsoon-p6", platform: "X", author: "@alappuzha_updates", text: "Coastal fishermen drove their mechanized trawlers 60km inland to rescue 300 families in low-lying paddy tracts. True heroes.", timestamp: "7h ago", likes: "14.5K", reposts: "3.2K" }
       ]
     }
   ],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Relief-camp list gets pinned and shared 61K times across districts', ago: '40 minutes ago', tag: 'X' },
     { src: 'Telegram', c: '#0088cc', t: 'IMD red alert forwarded to 1.1M subscribers within nine minutes', ago: '5 hours ago', tag: 'TG' },
     { src: 'Reddit', c: '#ff4500', t: 'r/india megathread active with verified state relief and helpline links', ago: '7 hours ago', tag: 'RD' }
   ]
  },
  {id:'creator',name:'Creator monetisation',cat:'Media & Creators',vol:1400000,reach:18200000,growth:72,
   desc:'A payout-structure change is reshaping how regional-language creators talk about brand deals and platform trust, concentrated in Maharashtra, Uttar Pradesh and Tamil Nadu.',
   emo:{against:23,sarcasm:20,supportive:19,anxiety:16,excitement:14,neutral:8},
   kw:['payout change','rate card leak','brand deal pricing','watch-time shift','platform trust'],
   hubs:['Maharashtra','Uttar Pradesh','Tamil Nadu','Delhi'],
   events:[{at:.3,t:'Payout-change post goes viral',v:'26K mentions/hr'},{at:.8,t:'Rate-card spreadsheet shared',v:'34K mentions/hr'}],
   q: 'creator monetisation', label: 'creator monetisation', mentions: '1.4M',
   shape: [44, 46, 50, 54, 58, 40, 24, 28, 38, 42],
   narratives: [
     {
       id: "creator-1",
       title: "Long-form video RPM collapse",
       description: "Educational and documentary creators reporting steep RPM collapses despite rising overall platform screen time as platforms prioritize short-form retention.",
       assignedPostsCount: 32000,
       activitySeries: [20, 28, 40, 56, 74, 88, 82, 75, 68, 60, 52, 46, 40, 36, 32, 28, 25, 23, 21, 18],
       sentiment: "Negative",
       growth: 98,
       updatedAt: "2026-10-22T16:00:00Z",
       platforms: [
         { platform: "X", count: 16000 },
         { platform: "Reddit", count: 11000 },
         { platform: "Telegram", count: 5000 }
       ],
       posts: [
         { id: "creator-p1", platform: "X", author: "@video_essayist_india", text: "Spent 3 weeks researching and editing a 22-minute documentary. 400K views made ₹11,000. Short-form algorithmic changes are choking depth.", timestamp: "2h ago", likes: "7.8K", reposts: "1.9K" },
         { id: "creator-p2", platform: "Reddit", author: "u/indie_creator_lab", text: "RPM dropped from ₹85 to ₹28 on long-form content across all tech channels this quarter.", timestamp: "3h ago", likes: "2.4K" }
       ]
     },
     {
       id: "creator-2",
       title: "Regional sponsor rate gap",
       description: "Outrage over Hindi, Tamil, and Telugu creators being offered up to 70% lower brand integration rates than English peers with identical audience sizes.",
       assignedPostsCount: 26000,
       activitySeries: [14, 20, 32, 48, 66, 80, 85, 78, 72, 65, 58, 52, 46, 41, 37, 33, 29, 26, 23, 20],
       sentiment: "Negative",
       growth: 115,
       updatedAt: "2026-10-22T14:20:00Z",
       platforms: [
         { platform: "Reddit", count: 14000 },
         { platform: "Telegram", count: 7000 },
         { platform: "X", count: 5000 }
       ],
       posts: [
         { id: "creator-p3", platform: "Reddit", author: "u/telugu_tech_reviews", text: "Agency offered me ₹40K for a dedicated video with 800K regular views. English channel with 200K was offered ₹1.5L. Unacceptable exploitation.", timestamp: "4h ago", likes: "4.1K" }
       ]
     },
     {
       id: "creator-3",
       title: "Direct subscriber monetization",
       description: "Creators successfully migrating audiences to independent Discord channels, Substack newsletters, and cohort courses to bypass ad revenue volatility.",
       assignedPostsCount: 19000,
       activitySeries: [10, 14, 20, 28, 36, 46, 56, 65, 75, 84, 91, 95, 92, 88, 85, 81, 78, 74, 70, 67],
       sentiment: "Positive",
       growth: 140,
       updatedAt: "2026-10-22T12:45:00Z",
       platforms: [
         { platform: "Telegram", count: 10000 },
         { platform: "X", count: 5500 },
         { platform: "Reddit", count: 3500 }
       ],
       posts: [
         { id: "creator-p4", platform: "Telegram", author: "Creator Monetization Club", text: "Launched paid community tier for freelance designers. 450 members joined in 48 hours. Zero reliance on platform algorithm.", timestamp: "5h ago", likes: "3.2K" }
       ]
     },
     {
       id: "creator-4",
       title: "Barter gift TDS panic",
       description: "Micro-influencers seeking clarity on tax liabilities for free PR products, hotel stays, and smartphone review evaluation units.",
       assignedPostsCount: 14000,
       activitySeries: [12, 16, 21, 27, 34, 42, 50, 58, 66, 72, 78, 82, 85, 81, 77, 73, 69, 65, 61, 57],
       sentiment: "Uncertain",
       growth: 62,
       updatedAt: "2026-10-22T10:30:00Z",
       platforms: [
         { platform: "Reddit", count: 7500 },
         { platform: "X", count: 4500 },
         { platform: "Telegram", count: 2000 }
       ],
       posts: [
         { id: "creator-p5", platform: "Reddit", author: "u/tax_talk_india", text: "If a brand sends a ₹60,000 phone for a video review and demands it back, why is the agency deducting Section 194R TDS? Total mess.", timestamp: "7h ago", likes: "1.8K" }
       ]
     },
     {
       id: "creator-5",
       title: "Creator union against strikes",
       description: "Mobilization among tech and film review channels demanding human appeal arbitration for automated algorithmic copyright strikes.",
       assignedPostsCount: 8000,
       activitySeries: [10, 14, 20, 28, 38, 50, 62, 72, 76, 74, 69, 64, 58, 53, 48, 44, 40, 36, 33, 30],
       sentiment: "Uncertain",
       growth: 75,
       updatedAt: "2026-10-22T08:15:00Z",
       platforms: [
         { platform: "X", count: 4500 },
         { platform: "Reddit", count: 2500 },
         { platform: "Telegram", count: 1000 }
       ],
       posts: [
         { id: "creator-p6", platform: "X", author: "@indian_creators_guild", text: "Meeting held with 40 channel founders in Mumbai. Charter drafted for collective legal representation against false DMCA strikes.", timestamp: "9h ago", likes: "4.3K", reposts: "1.1K" }
       ]
     }
   ],
   posts: [
     { src: 'X (Twitter)', c: '#000000', t: 'Rate-card spreadsheet goes around, brand-deal pricing debate follows', ago: '6 hours ago', tag: 'X' },
     { src: 'Telegram', c: '#0088cc', t: 'Creator broadcast channel shares revised brand payout calculator', ago: '4 hours ago', tag: 'TG' },
     { src: 'Reddit', c: '#ff4500', t: 'r/InstaCelebsGossip & creator subreddits debate platform revenue split', ago: '8 hours ago', tag: 'RD' }
   ]
  }
];

export function getNarrativesForTopic(topicId: string): Narrative[] {
  const t = TOPICS.find((topic) => topic.id === topicId);
  return (t?.narratives as Narrative[]) || [];
}

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

export const fmt = (n: number) => {
  if (n >= 1e6) {
    const val = (n / 1e6).toFixed(1);
    return val.endsWith('.0') ? val.slice(0, -2) + 'M' : val + 'M';
  }
  if (n >= 1e3) {
    const val = (n / 1e3).toFixed(1);
    return val.endsWith('.0') ? val.slice(0, -2) + 'K' : val + 'K';
  }
  return Math.round(n).toString();
};
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
