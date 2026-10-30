/* GLIMMER POP — original deterministic, offline-first match-three engine.
   No DOM, no network, no timers. All game events derive from validated turns. */
export const SIZE = 7;
export const TYPES = ['fern','aqua','ember','sun','orchid','luna'];
export const LEVEL_NAMES = ['First Light','Fernway','Lantern Walk','Moonwell','Copper Falls','The Wishing Tree','Quiet Constellations','Firefly Hollow','The Glasshouse','Twilight Orchard','The Long Glow','Evergreen'];
export function levelSpec(level=1){
  const n=Number.isInteger(level)&&level>0?Math.min(level,999):1;
  return {level:n,title:LEVEL_NAMES[(n-1)%LEVEL_NAMES.length]+(n>LEVEL_NAMES.length?` · ${n}`:''),targetType:TYPES[(n-1)%TYPES.length],target:12+Math.min(12,Math.floor(n*1.35)),moves:Math.max(18,24-Math.floor(n/4)),seed:(0x9e3779b9^Math.imul(n,2654435761))>>>0};
}
export function randomStep(x){let t=(x+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return [(t^(t>>>14))>>>0, (x+0x6D2B79F5)>>>0];}
function pick(rng,len=TYPES.length){const [x,seed]=randomStep(rng.seed);rng.seed=seed;return x%len;}
const row=i=>Math.floor(i/SIZE),col=i=>i%SIZE;
export function adjacent(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<SIZE*SIZE&&b<SIZE*SIZE&&Math.abs(row(a)-row(b))+Math.abs(col(a)-col(b))===1;}
export function matches(board){
  const groups=[];
  const scan=(indices)=>{let start=0;while(start<indices.length){let end=start+1;while(end<indices.length&&board[indices[end]]===board[indices[start]])end++;if(end-start>=3&&board[indices[start]]!==null)groups.push(indices.slice(start,end));start=end;}};
  for(let r=0;r<SIZE;r++)scan(Array.from({length:SIZE},(_,c)=>r*SIZE+c));
  for(let c=0;c<SIZE;c++)scan(Array.from({length:SIZE},(_,r)=>r*SIZE+c));
  return groups;
}
export function findMove(board){for(let a=0;a<board.length;a++){for(const b of [a+1,a+SIZE]){if(!adjacent(a,b))continue;const copy=[...board];[copy[a],copy[b]]=[copy[b],copy[a]];if(matches(copy).length)return {from:a,to:b};}}return null;}
function freshBoard(seed){const rng={seed};let board=[];for(let i=0;i<SIZE*SIZE;i++){
 const valid=TYPES.filter(v=>!(col(i)>=2&&board[i-1]===v&&board[i-2]===v)&&!(row(i)>=2&&board[i-SIZE]===v&&board[i-SIZE*2]===v));
 board.push(valid[pick(rng,valid.length)]);
 }return {board,seed:rng.seed};
}
export function makeRun(level=1,seedOverride=null){const spec=levelSpec(level);let seed=seedOverride===null?spec.seed:seedOverride>>>0;let candidate;
 for(let tries=0;tries<300;tries++){candidate=freshBoard(seed);if(findMove(candidate.board))break;seed=(seed+1013904223)>>>0;}
 if(!findMove(candidate.board))throw Error('Could not create playable board');
 return {version:1,level:spec.level,board:candidate.board,seed:candidate.seed,movesLeft:spec.moves,score:0,collected:0,totalMatched:0,bestChain:0,movesMade:0,won:false,ended:false,stars:0,turn:0};
}
function collapse(board,rng){for(let c=0;c<SIZE;c++){let write=SIZE-1;for(let r=SIZE-1;r>=0;r--){const v=board[r*SIZE+c];if(v!==null)board[write--*SIZE+c]=v;}while(write>=0)board[write--*SIZE+c]=TYPES[pick(rng)];}}
function blast(groups){const removed=new Set(groups.flat());let specials=0;for(const group of groups){if(group.length>=4){specials++;const target=group[Math.floor(group.length/2)];const r=row(target),c=col(target);if(group.length>=5){for(let i=0;i<SIZE;i++){removed.add(r*SIZE+i);removed.add(i*SIZE+c);}}else{for(const offset of [-SIZE,SIZE,-1,1]){let idx=target+offset;if(idx>=0&&idx<SIZE*SIZE&&(Math.abs(row(idx)-r)+Math.abs(col(idx)-c)===1))removed.add(idx);}}}}
 return {removed,specials};
}
export function trySwap(run,a,b){
 if(!validateRun(run)||run.ended)return {ok:false,reason:'not-playing',run};
 if(!adjacent(a,b))return {ok:false,reason:'not-adjacent',run};
 const next={...run,board:[...run.board]};[next.board[a],next.board[b]]=[next.board[b],next.board[a]];
 let groups=matches(next.board);if(!groups.length)return {ok:false,reason:'no-match',run};
 next.movesLeft--;next.movesMade++;next.turn++;
 const rng={seed:next.seed};let chain=0,removedCount=0,bonuses=0,points=0,got=0;
 while(groups.length&&chain<25){chain++;const {removed,specials}=blast(groups);bonuses+=specials;for(const index of removed){if(next.board[index]===levelSpec(run.level).targetType)got++;next.board[index]=null;}
 const count=removed.size;removedCount+=count;points+=(count*100+specials*210)*chain;collapse(next.board,rng);groups=matches(next.board);}
 next.seed=rng.seed;next.score+=points;next.totalMatched+=removedCount;next.collected+=got;next.bestChain=Math.max(next.bestChain,chain);
 const target=levelSpec(run.level).target;
 if(next.collected>=target){next.won=true;next.ended=true;next.score+=next.movesLeft*90;next.stars=next.movesLeft>=8||chain>=4?3:next.movesLeft>=3||chain>=2?2:1;}
 else if(next.movesLeft<=0){next.ended=true;next.won=false;next.stars=0;}
 if(!next.ended&&!findMove(next.board)){
   let safe=freshBoard(rng.seed);for(let i=0;i<100&&!findMove(safe.board);i++)safe=freshBoard((safe.seed+0x9e3779b9)>>>0);
   next.board=safe.board;next.seed=safe.seed;
 }
 return {ok:true,run:next,event:{matched:removedCount,gained:points,goal:got,chain,bonuses,won:next.won,ended:next.ended,stars:next.stars}};
}
export function validateRun(r){if(!r||r.version!==1||!Number.isInteger(r.level)||r.level<1||r.level>999||!Array.isArray(r.board)||r.board.length!==SIZE*SIZE||!r.board.every(v=>TYPES.includes(v)))return false;
 for(const k of ['seed','movesLeft','score','collected','totalMatched','bestChain','movesMade','stars','turn'])if(!Number.isFinite(r[k])||!Number.isInteger(r[k])||r[k]<0||r[k]>2**32)return false;
 if(typeof r.ended!=='boolean'||typeof r.won!=='boolean'||r.won&&!r.ended||r.stars>3||r.movesLeft>levelSpec(r.level).moves)return false;
 return true;}
