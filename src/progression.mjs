/* BRANDICADE — local-only identity, achievements, progression and backup.
   Future authenticated sync must be a separate opt-in feature. */
import {validateRun} from './engine.mjs';
export const SAVE_KEY='brandicade:save:v1';
export const AVATARS=[
  {id:'moth',label:'Moon Moth',description:'The quiet lantern keeper'},
  {id:'fox',label:'Ember Fox',description:'A curious little spark'},
  {id:'flower',label:'Forest Bloom',description:'A jewel in the garden'},
];
export const FRAMES=[{id:'copper',label:'Copper Dawn',level:1},{id:'teal',label:'Moonlit Teal',level:3},{id:'orchid',label:'Orchid Night',level:5}];
export const TITLES=[{id:'keeper',label:'Keeper of the Grove',level:1},{id:'light',label:'Lantern Whisperer',level:3},{id:'dream',label:'Dream Gardener',level:6},{id:'queen',label:'Queen of the Arcade',level:10}];
export const ACHIEVEMENTS=[
 {id:'first-light',name:'First Light',description:'Win your first Glimmer Pop puzzle.',rarity:'common',icon:'spark',goal:1,track:'wins',xp:35},
 {id:'triple-glow',name:'Triple Glow',description:'Create a three-cascade chain in a single turn.',rarity:'rare',icon:'spark',goal:3,track:'bestChain',xp:45},
 {id:'three-stars',name:'Pure Radiance',description:'Earn three stars on a single level.',rarity:'rare',icon:'star',goal:1,track:'threeStarWins',xp:50},
 {id:'petal-trail',name:'Petal Trail',description:'Collect 80 pieces across all your puzzles.',rarity:'common',icon:'flower',goal:80,track:'matched',xp:35},
 {id:'lantern-walk',name:'Lantern Walk',description:'Reach arcade level 3.',rarity:'rare',icon:'lantern',goal:3,track:'level',xp:50},
 {id:'lasting-glow',name:'The Long Glow',description:'Win 10 Glimmer Pop puzzles.',rarity:'epic',icon:'crown',goal:10,track:'wins',xp:70},
 {id:'five-doors',name:'Five Little Worlds',description:'Finish five different Glimmer Pop levels.',rarity:'epic',icon:'portal',goal:5,track:'levelsBeaten',xp:65},
 {id:'moonlight',name:'Moonlight Keeper',description:'Play on three separate calendar days.',rarity:'rare',icon:'moon',goal:3,track:'days',xp:35},
 {id:'special-spark',name:'Wild Magic',description:'Trigger five four-or-more-piece special clears.',rarity:'rare',icon:'flower',goal:5,track:'specials',xp:45},
 {id:'night-garden',name:'A Whole Garden',description:'Earn 20 stars across your best level results.',rarity:'legendary',icon:'crown',goal:20,track:'totalStars',xp:90},
 ];
export const LEVEL_CAP=200;
const nowISO=()=>new Date().toISOString();
export function newSave(){const now=nowISO();return {schemaVersion:1,createdAt:now,updatedAt:now,
 profile:{name:'Brandi',avatar:'moth',frame:'copper',title:'keeper'},
 progression:{level:1,xp:0,petals:0,unlockedLevel:1,levels:{},totalStars:0},
 stats:{wins:0,losses:0,matches:0,bestChain:0,threeStarWins:0,specials:0,played:0,totalScore:0,days:[],lastPlayed:null},
 achievements:{},currentRun:null,
 settings:{sound:true,motion:'system',contrast:false,colorAssist:false},
 history:[]};}
export function xpThreshold(level){return Math.round(130+Math.pow(Math.max(1,level),1.2)*37);}
export function levelTitle(save){return TITLES.find(x=>x.id===save.profile.title)?.label||TITLES[0].label;}
function safeObject(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function boundedInt(v,lo=0,hi=1e9){return Number.isSafeInteger(v)&&v>=lo&&v<=hi?v:lo;}
function boundedString(v,max=32){return typeof v==='string'?v.slice(0,max):'';}
function isIso(v){return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&Number.isFinite(Date.parse(v));}
export function sanitizeSave(input){
 const i=safeObject(input);if(i.schemaVersion!==1)throw Error('Unsupported save version. No data was changed.');
 const out=newSave(), profile=safeObject(i.profile), prog=safeObject(i.progression),stats=safeObject(i.stats),sett=safeObject(i.settings);
 out.createdAt=isIso(i.createdAt)?i.createdAt:out.createdAt;
 out.updatedAt=isIso(i.updatedAt)?i.updatedAt:out.updatedAt;
 out.profile.name='Brandi';
 if(AVATARS.some(x=>x.id===profile.avatar))out.profile.avatar=profile.avatar;
 if(FRAMES.some(x=>x.id===profile.frame))out.profile.frame=profile.frame;
 if(TITLES.some(x=>x.id===profile.title))out.profile.title=profile.title;
 out.progression.level=boundedInt(prog.level,1,LEVEL_CAP)||1;
 out.progression.xp=boundedInt(prog.xp,0,xpThreshold(out.progression.level));
 out.progression.petals=boundedInt(prog.petals,0,1000000);
 out.progression.unlockedLevel=boundedInt(prog.unlockedLevel,1,999)||1;
 const levels=safeObject(prog.levels);
 for(const [id,v] of Object.entries(levels).slice(0,999)){
   if(!/^([1-9]\d{0,2})$/.test(id))continue;
   const obj=safeObject(v), stars=boundedInt(obj.stars,0,3),best=boundedInt(obj.bestScore,0,100000000);
   if(stars>0)out.progression.levels[id]={stars,bestScore:best,wins:boundedInt(obj.wins,1,100000)};
 }
 out.progression.totalStars=Object.values(out.progression.levels).reduce((a,v)=>a+v.stars,0);
 for(const key of ['wins','losses','matches','bestChain','threeStarWins','specials','played','totalScore'])out.stats[key]=boundedInt(stats[key]);
 out.stats.bestChain=Math.min(out.stats.bestChain,999);
 out.stats.days=Array.isArray(stats.days)?[...new Set(stats.days.filter(s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)))].slice(-3650):[];
 out.stats.lastPlayed=isIso(stats.lastPlayed)?stats.lastPlayed:null;
 const ach=safeObject(i.achievements);
 for(const def of ACHIEVEMENTS)if(isIso(ach[def.id]))out.achievements[def.id]=ach[def.id];
 out.settings.sound=sett.sound!==false;
 out.settings.motion=['system','on','off'].includes(sett.motion)?sett.motion:'system';
 out.settings.contrast=sett.contrast===true;out.settings.colorAssist=sett.colorAssist===true;
 out.currentRun=validateRun(i.currentRun)?i.currentRun:null;
 out.history=Array.isArray(i.history)?i.history.slice(-50).filter(x=>x&&typeof x.type==='string'&&typeof x.date==='string').map(x=>({type:boundedString(x.type,32),date:boundedString(x.date,40),message:boundedString(x.message,120)})):[];
 // Never allow imported cosmetics to bypass their earned level requirement.
 if((FRAMES.find(x=>x.id===out.profile.frame)?.level||1)>out.progression.level)out.profile.frame='copper';
 if((TITLES.find(x=>x.id===out.profile.title)?.level||1)>out.progression.level)out.profile.title='keeper';
 return out;
}
export function loadSave(storage=null){try{storage??=globalThis.localStorage;const raw=storage.getItem(SAVE_KEY);return raw?sanitizeSave(JSON.parse(raw)):newSave();}catch{return newSave();}}
export function persist(save,storage=null){save.updatedAt=nowISO();try{storage??=globalThis.localStorage;storage.setItem(SAVE_KEY,JSON.stringify(save));return true;}catch{return false;}}
export function exportSave(save){return JSON.stringify({format:'BRANDICADE_BACKUP',exportedAt:nowISO(),data:sanitizeSave(save)},null,2);}
export function importSave(text){if(typeof text!=='string'||text.length>512000)throw Error('Backup must be smaller than 500KB.');let parsed;try{parsed=JSON.parse(text);}catch{throw Error('That file is not valid JSON.');}
 if(parsed?.format!=='BRANDICADE_BACKUP')throw Error('This is not a BRANDICADE backup.');
 return sanitizeSave(parsed.data);
}
export function earnedCount(save){return Object.keys(save.achievements).length;}
export function metric(save,def){switch(def.track){case 'level':return save.progression.level;case 'levelsBeaten':return Object.keys(save.progression.levels).length;case 'totalStars':return save.progression.totalStars;case 'days':return save.stats.days.length;default:return Number(save.stats[def.track]||0);}}
function grantXP(save,amount){const before=save.progression.level;save.progression.xp+=amount;while(save.progression.level<LEVEL_CAP&&save.progression.xp>=xpThreshold(save.progression.level)){save.progression.xp-=xpThreshold(save.progression.level);save.progression.level++;}return save.progression.level>before?save.progression.level:null;}
function evaluateAwards(save){const newAwards=[];for(const a of ACHIEVEMENTS){if(!save.achievements[a.id]&&metric(save,a)>=a.goal){save.achievements[a.id]=nowISO();newAwards.push(a);}}
 let gained=0;for(const a of newAwards){gained+=a.xp;save.progression.petals+=Math.round(a.xp/5);save.history.push({type:'achievement',date:nowISO(),message:a.name});}
 const newLevel=grantXP(save,gained);save.history=save.history.slice(-50);return {newAwards,newLevel,bonusXP:gained};
}
export function recordVisit(save,date=new Date()){const day=date.toISOString().slice(0,10);if(!save.stats.days.includes(day)){save.stats.days.push(day);save.stats.days=save.stats.days.slice(-3650);return evaluateAwards(save);}return {newAwards:[],newLevel:null,bonusXP:0};}
export function recordTurn(save,event){if(!event||!Number.isInteger(event.matched)||event.matched<3)return {newAwards:[],newLevel:null};
 save.stats.matches+=event.matched;save.stats.specials+=event.bonuses||0;save.stats.bestChain=Math.max(save.stats.bestChain,event.chain||0);
 return evaluateAwards(save);
}
export function recordEnd(save,run){if(!run?.ended)throw Error('Cannot reward an unfinished run');
 save.stats.played++;save.stats.lastPlayed=nowISO();let baseXP=0,petals=0;
 if(run.won){save.stats.wins++;save.stats.totalScore+=run.score;if(run.stars===3)save.stats.threeStarWins++;
   const id=String(run.level),prev=save.progression.levels[id];const first=!prev;
   if(first||run.stars>prev.stars||run.score>prev.bestScore){save.progression.levels[id]={stars:Math.max(prev?.stars||0,run.stars),bestScore:Math.max(prev?.bestScore||0,run.score),wins:(prev?.wins||0)+1};}
   else if(prev)prev.wins++;
   save.progression.unlockedLevel=Math.max(save.progression.unlockedLevel,run.level+1);
   save.progression.totalStars=Object.values(save.progression.levels).reduce((n,v)=>n+v.stars,0);
   baseXP=first?75+run.stars*20:15+run.stars*5;
   petals=first?18+run.stars*4:4+run.stars;
 }else{save.stats.losses++;baseXP=8;petals=1;}
 save.progression.petals+=petals;
 const bonus=evaluateAwards(save),lev=grantXP(save,baseXP);
 save.history.push({type:run.won?'win':'attempt',date:nowISO(),message:`Glimmer Pop · Level ${run.level} ${run.won?'completed':'attempted'}`});save.history=save.history.slice(-50);
 return {...bonus,newLevel:lev||bonus.newLevel,gainedXP:baseXP+bonus.bonusXP,petals};
}
