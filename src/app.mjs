import {SIZE,TYPES,LEVEL_NAMES,levelSpec,makeRun,findMove,trySwap,adjacent} from './engine.mjs';
import {AVATARS,FRAMES,TITLES,ACHIEVEMENTS,newSave,loadSave,persist,sanitizeSave,exportSave,importSave,earnedCount,metric,recordVisit,recordTurn,recordEnd,xpThreshold,levelTitle} from './progression.mjs';

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const escapeHTML=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let save=loadSave(),selected=null,moving=false,lastTrigger=null,importPending=null,noticeTimeout=null,ignoreClickUntil=0;
let storageWarningShown=false,prevPage='home';
const TYPE_LABELS={fern:'fern',aqua:'waterdrop',ember:'ember',sun:'sun',orchid:'orchid',luna:'moonstone'};
const activeMotion=()=>save.settings.motion==='on'||save.settings.motion==='system'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function commit(){if(!persist(save)&&!storageWarningShown){storageWarningShown=true;toast('This browser is not saving progress. Export your game regularly.');}}
function saveVisited(){const award=recordVisit(save);commit();return award;}

// High-resolution vector gemstones. Shapes, not font glyphs or generic emoji.
const GEM_PATHS={
 fern:`<path class="gem-shade" d="M26 57Q8 42 22 18Q42 4 52 11Q62 26 45 50Q35 59 26 57Z"/><path class="gem-fill" d="M29 50Q18 40 27 22Q37 12 51 13Q53 33 41 45Z"/><path class="gem-highlight" d="M27 34Q28 23 39 18Q30 30 27 34Z"/><path class="gem-stroke" d="M20 59Q32 42 46 20M29 38l-5-10m12 2 11 4"/>`,
 aqua:`<path class="gem-shade" d="M32 6C25 18 12 33 12 43a20 20 0 0 0 40 0C52 33 39 18 32 6Z"/><path class="gem-fill" d="M32 10C26 22 18 34 18 43a14 14 0 0 0 28 0C46 34 38 20 32 10Z"/><path class="gem-highlight" d="M27 28c-9 9-10 23-2 24-3-8-2-15 2-24Z"/>`,
 ember:`<path class="gem-shade" d="M31 4C17 21 30 26 18 39c-9 9-3 26 15 24 16-1 24-15 15-30C41 24 44 13 31 4Z"/><path class="gem-fill" d="M31 17c-8 16 3 19-7 29-6 13 13 20 22 4 4-10-7-19-7-24-4 10-9 11-8-9Z"/><path class="gem-highlight" d="M28 40c-10 10 1 18 7 13-5-3-7-7-7-13Z"/>`,
 sun:`<path class="gem-shade" d="m32 4 7 13 14-5-1 15 11 9-12 8 2 15-15-5-7 10-9-11-14 5 3-15L1 35l13-8-1-15 15 5 4-13Z"/><path class="gem-fill" d="m32 14 5 11 11-3-3 11 8 5-11 5-3 12-7-9-10 7-1-12-11-6 11-5 1-11 10 4Z"/><circle cx="32" cy="36" r="10" fill="#fff5cd" opacity=".72"/>`,
 orchid:`<path class="gem-shade" d="M32 7Q46-2 49 15Q63 17 58 32Q67 44 50 50Q48 66 31 56Q16 65 13 49Q-2 45 6 31Q2 17 19 15Q21-2 32 7Z"/><path class="gem-fill" d="M32 11Q40 4 46 23Q61 20 51 37Q60 49 40 49Q32 61 24 49Q4 49 14 37Q4 20 19 23Q23 4 32 11Z"/><circle cx="32" cy="35" r="10" fill="#ffd6a1"/><circle cx="32" cy="35" r="4" fill="#b36f4e"/><path class="gem-highlight" d="M24 16Q28 10 31 15Q26 23 24 16Z"/>`,
 luna:`<path class="gem-shade" d="M43 5C16 6 4 34 17 51c12 17 33 8 39-6C34 53 20 32 43 5Z"/><path class="gem-fill" d="M37 12C17 18 12 35 22 48c7 9 20 8 26 3C27 51 20 32 37 12Z"/><path class="gem-highlight" d="M20 35c-2-6 3-18 11-23-8 10-11 17-11 23Z"/><circle cx="48" cy="15" r="4" fill="#d7dcff"/><path d="m50 27 3 5 5 3-5 2-3 6-3-6-5-2 5-3Z" fill="#ebf1ff"/>`
};
function gemSVG(type){return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${GEM_PATHS[type]||GEM_PATHS.fern}</svg>`;}
const ICON_PATHS={
 spark:`<path d="m50 7 10 29 29 14-29 10-10 29-11-29L11 50l28-14Z" fill="#eac38e" stroke="#fff2ca" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="#64ddbd"/>`,
 star:`<path d="m50 7 12 27 29 3-22 19 8 29-27-15-27 15 8-29-22-19 29-3Z" fill="#e1b56e" stroke="#fff0c6" stroke-width="3"/><path d="m50 24 7 16 18 2-14 13 5 17-16-10-16 10 5-17-14-13 18-2Z" fill="#4bcfae"/>`,
 flower:`<g fill="#e3a0bc" stroke="#f8d2d1" stroke-width="2">${[0,72,144,216,288].map(a=>`<ellipse cx="50" cy="31" rx="14" ry="23" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="16" fill="#eec681" stroke="#b5744c" stroke-width="3"/>`,
 lantern:`<path d="M31 29 50 12l19 17v40L50 84 31 69Z" fill="#2d927b" stroke="#f4dca3" stroke-width="4"/><path d="M38 35h24v30H38Z" fill="#f4cd8b"/><path d="m50 40 7 12-7 9-7-9Z" fill="#e7884d"/><path d="M50 12V5" stroke="#ffdfa4" stroke-width="5"/>`,
 crown:`<path d="m12 30 21 18 17-31 17 31 21-18-9 49H21Z" fill="#c9894d" stroke="#ffe5aa" stroke-width="4"/><path d="M23 68h54" stroke="#ffe0ab" stroke-width="4"/><circle cx="50" cy="61" r="8" fill="#75ddc6"/>`,
 portal:`<path d="M24 81V43a26 26 0 0 1 52 0v38Z" fill="#0b4b49" stroke="#f1c58c" stroke-width="6"/><path d="M34 76V43a16 16 0 0 1 32 0v33Z" fill="#6ce4bc"/><path d="M50 39V17" stroke="#f0e6aa" stroke-width="3"/>`,
 moon:`<path d="M66 14C24 12 6 49 24 73c18 22 45 12 56-9C43 74 24 43 66 14Z" fill="#a9c8ee" stroke="#e2f5ff" stroke-width="3"/><path d="m70 23 3 7 7 3-7 3-3 8-3-8-8-3 8-3Z" fill="#edc98a"/>`
};
function medalSVG(icon){return `<svg viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="#0f3030" stroke="#dcb17a" stroke-width="4"/><circle cx="50" cy="50" r="38" fill="none" stroke="#8ec9b0" stroke-dasharray="2 5" stroke-width="1.4"/>${ICON_PATHS[icon]||ICON_PATHS.spark}</svg>`;}
const AVATAR_SHAPES={
 moth:`<svg viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="wing" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3c999"/><stop offset="1" stop-color="#548d84"/></linearGradient></defs><path d="M64 48Q29-4 10 32Q-7 69 45 78Q11 87 40 108Q54 120 64 87Q74 120 88 108Q117 87 83 78Q135 69 118 32Q99-4 64 48Z" fill="url(#wing)" stroke="#f4dcaa" stroke-width="3"/><path d="M64 47Q35 20 28 42Q21 68 56 67M64 47Q93 20 100 42Q107 68 72 67" fill="none" stroke="#fff3c3" stroke-width="3" opacity=".9"/><ellipse cx="64" cy="70" rx="9" ry="29" fill="#135f61" stroke="#9fead0" stroke-width="3"/><path d="M61 46Q46 29 40 31M67 46q15-17 21-15" stroke="#ffe5b5" stroke-width="3" fill="none"/><circle cx="64" cy="63" r="4" fill="#fff0c8"/></svg>`,
 fox:`<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M20 14 49 37l16-3 16 3 27-23 4 66Q102 114 65 116 28 113 16 80Z" fill="#b65d38" stroke="#f1bf89" stroke-width="4"/><path d="m30 29 16 16-23 18m75-34-16 16 23 18" fill="#f8c6a0"/><path d="M28 68Q47 56 64 75Q82 56 100 68L94 98Q63 123 34 98Z" fill="#f6dcc1"/><path d="m40 69 14 5-12 5m46-10-14 5 12 5" fill="#17362f"/><path d="M64 88 56 85h16Z" fill="#6f342d"/><path d="M57 97q7 7 14 0" fill="none" stroke="#6c382e" stroke-width="2.5"/></svg>`,
 flower:`<svg viewBox="0 0 128 128" aria-hidden="true"><g fill="#b573aa" stroke="#ffdbd8" stroke-width="3">${[0,60,120,180,240,300].map(a=>`<ellipse cx="64" cy="32" rx="20" ry="30" transform="rotate(${a} 64 64)"/>`).join('')}</g><circle cx="64" cy="64" r="27" fill="#eecb91" stroke="#885b42" stroke-width="3"/><circle cx="64" cy="64" r="17" fill="#d48959"/><g fill="#ffedbe">${[0,72,144,216,288].map(a=>`<circle cx="64" cy="51" r="3.4" transform="rotate(${a} 64 64)"/>`).join('')}</g></svg>`
};
function avatarSVG(type){return AVATAR_SHAPES[type]||AVATAR_SHAPES.moth;}

function applySettings(){const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 document.body.classList.toggle('calm',save.settings.motion==='off');document.body.classList.toggle('force-motion',save.settings.motion==='on'&&reduced);
 document.body.classList.toggle('high-contrast',save.settings.contrast);document.body.classList.toggle('color-assist',save.settings.colorAssist);
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>el.classList.remove('visible'),2900);}
let audioContext=null;
function sound(kind='tap'){if(!save.settings.sound)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audioContext??=new A();if(audioContext.state==='suspended')void audioContext.resume();const t=audioContext.currentTime,notes=kind==='win'?[392,523.25,659.25,783.99,1046.5]:kind==='match'?[523.25,783.99]:kind==='award'?[440,554.37,659.25,880]:kind==='wrong'?[220,185]:[420];
 notes.forEach((hz,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=kind==='wrong'?'triangle':'sine';const st=t+i*.075;o.frequency.value=hz;g.gain.setValueAtTime(.0001,st);g.gain.exponentialRampToValueAtTime(kind==='tap'?.017:.035,st+.013);g.gain.exponentialRampToValueAtTime(.0001,st+.19);o.connect(g).connect(audioContext.destination);o.start(st);o.stop(st+.21);});}catch{}}
function haptic(){if(!save.settings.sound&&!save.settings.motion)return;try{navigator.vibrate?.(9);}catch{}}
function confetti(amount=32){if(!activeMotion())return;const el=$('#celebrations'),colors=['#e4b77e','#5ce9c5','#64a2a1','#f3dcc1','#e29abb'];el.replaceChildren();for(let i=0;i<amount;i++){const bit=document.createElement('span');bit.className='celebration-bit';bit.style.setProperty('--x',`${Math.random()*100}%`);bit.style.setProperty('--size',`${4+Math.random()*7}px`);bit.style.setProperty('--color',colors[i%colors.length]);bit.style.setProperty('--time',`${1.4+Math.random()*1.4}s`);el.append(bit);}setTimeout(()=>el.replaceChildren(),3100);}
function ensureRun(){if(!save.currentRun)save.currentRun=makeRun(save.progression.unlockedLevel);commit();return save.currentRun;}
function navigate(id,replace=false){const valid=['home','library','game','profile','treasures','together'];if(!valid.includes(id))id='home';if(id==='game')ensureRun();prevPage=$('.section.active')?.id||'home';
 $$('.section').forEach(el=>{el.classList.toggle('active',el.id===id);el.setAttribute('aria-hidden',el.id===id?'false':'true')});$$('.nav-button').forEach(el=>{const on=el.dataset.go===id;el.classList.toggle('active',on);on?el.setAttribute('aria-current','page'):el.removeAttribute('aria-current');});
 if(location.hash!==`#${id}`){if(replace)history.replaceState(null,'',`#${id}`);else history.pushState(null,'',`#${id}`)}
 if(id==='game')renderGame();if(id==='profile')renderProfile();if(id==='treasures')renderTreasures();if(id==='home')renderHome();
 if(document.activeElement instanceof HTMLElement&&document.activeElement.closest('section')&&document.activeElement.closest('section')?.id!==id)document.activeElement.blur();
 window.scrollTo({top:0,behavior:'instant'});
}
function renderHome(){const p=save.progression;$('#hero-level').textContent=String(p.level).padStart(2,'0');$('#hero-stars').textContent=String(p.totalStars).padStart(2,'0');$('#hero-badges').textContent=String(earnedCount(save)).padStart(2,'0');$('#mini-level').textContent='LV '+p.level;
 const r=save.currentRun;const label=r&&!r.ended?'Continue Glimmer Pop':r?.won?'See your victory':'Play Glimmer Pop';$('#home-play-label').textContent=label;
 $('#home-glimmer-summary').textContent=r&&!r.ended?`Level ${r.level} · ${r.movesLeft} moves left · Your garden is waiting.`:'Satisfying matches, cascading magic, and a new level around every corner.';
 $('#library-glimmer-summary').textContent=r&&!r.ended?`Your level ${r.level} puzzle is waiting, exactly where you left it.`:'Unlimited levels and replay, with no lives to run out of.';
 const next=ACHIEVEMENTS.find(a=>!save.achievements[a.id]);const node=$('#next-treasure');if(next){node.innerHTML=`<span class="next-medal">${medalSVG(next.icon)}</span><div class="next-treasure-copy"><strong>${escapeHTML(next.name)}</strong><small>${metric(save,next)} / ${next.goal} · ${escapeHTML(next.description)}</small></div>`;}else{node.textContent='Every treasure in the gallery is yours.';}
 $('#story-title').textContent=save.stats.wins===0?'The first page of forever.':save.stats.wins<10?'Look at what you have grown.':'Your little universe is blooming.';
 $('#story-copy').textContent=save.stats.wins===0?'Every victory becomes a tiny permanent treasure. No timers forcing you to come back.':`${save.stats.wins} puzzles won, ${p.totalStars} stars earned, and more adventures yet to make. Nothing expires.`;
}
function renderGame(){const run=ensureRun(),spec=levelSpec(run.level),board=$('#pop-board');selected=null;
 $('#game-level').textContent=String(run.level).padStart(2,'0');$('#game-level-name').textContent=spec.title;$('#game-score').textContent=run.score.toLocaleString();$('#game-moves').textContent=run.movesLeft;
 $('#game-goal-text').textContent=`${Math.min(run.collected,spec.target)} / ${spec.target} ${TYPE_LABELS[spec.targetType]}${spec.target!==1?'s':''}`;$('#goal-symbol').innerHTML=gemSVG(spec.targetType);
 $('#goal-fill').style.width=Math.min(100,run.collected/spec.target*100)+'%';
 board.innerHTML=run.board.map((type,i)=>`<button class="charm ${type}" type="button" data-cell="${i}" data-letter="${type[0].toUpperCase()}" aria-label="Row ${Math.floor(i/SIZE)+1}, column ${i%SIZE+1}, ${TYPE_LABELS[type]}" aria-pressed="false" ${run.ended?'disabled':''}>${gemSVG(type)}</button>`).join('');
 const end=$('#game-end');end.hidden=!run.ended;if(run.ended){$('#end-eyebrow').textContent=run.won?'LEVEL COMPLETE':'A MOMENT TO REGROUP';$('#end-heading').textContent=run.won?'Beautifully done!':'The grove is still yours.';
 $('#end-stars').innerHTML=Array.from({length:3},(_,i)=>`<span class="${i<run.stars?'':'unearned'}" aria-hidden="true">★</span>`).join('');$('#end-stars').setAttribute('aria-label',`${run.stars} of 3 stars earned`);
 $('#end-message').textContent=run.won?'Every little victory helps your garden glow. The next adventure is ready whenever you are.':'No lost lives, no waiting, no penalties. Try this same level again as often as you like.';
 $('#end-stats').textContent=`${run.score.toLocaleString()} POINTS · ${run.collected} COLLECTED`;
 const next=$('[data-action="next"]');next.hidden=!run.won;
 }else{$('#game-live').textContent='Tap two neighboring charms, or swipe one into its neighbor.';}
}
function renderProfile(){const p=save.progression,profile=save.profile;
 $('#profile-avatar').innerHTML=avatarSVG(profile.avatar);$('.profile-hero').dataset.frame=profile.frame;
 $('#profile-equipped-title').textContent=levelTitle(save);$('#profile-level').textContent='LEVEL '+p.level;$('#profile-xp').textContent=`${p.xp} / ${xpThreshold(p.level)} XP`;$('#xp-fill').style.width=Math.max(0,Math.min(100,p.xp/xpThreshold(p.level)*100))+'%';$('#profile-petals').textContent=p.petals.toLocaleString();
 $('#stat-wins').textContent=save.stats.wins.toLocaleString();$('#stat-stars').textContent=p.totalStars;$('#stat-badges').textContent=earnedCount(save);$('#stat-levels').textContent=Object.keys(p.levels).length;
 $('#avatar-options').innerHTML=AVATARS.map(a=>`<button class="avatar-option ${profile.avatar===a.id?'selected':''}" data-avatar="${a.id}" type="button" aria-pressed="${profile.avatar===a.id}" title="${escapeHTML(a.description)}">${avatarSVG(a.id)}<strong>${escapeHTML(a.label)}</strong></button>`).join('');
 $('#frame-options').innerHTML=FRAMES.map(a=>{const locked=p.level<a.level;return `<button class="frame-option ${profile.frame===a.id?'selected':''}" data-frame="${a.id}" type="button" ${locked?'disabled':''} aria-pressed="${profile.frame===a.id}"><span class="frame-icon ${a.id}"></span><span>${escapeHTML(a.label)}</span><small>${locked?'LV '+a.level+' TO UNLOCK':profile.frame===a.id?'EQUIPPED':'UNLOCKED'}</small></button>`}).join('');
 $('#title-options').innerHTML=TITLES.map(a=>{const locked=p.level<a.level;return `<button class="title-option ${profile.title===a.id?'selected':''}" data-title="${a.id}" type="button" ${locked?'disabled':''} aria-pressed="${profile.title===a.id}"><span>${escapeHTML(a.label)}</span><small>${locked?'LV '+a.level:profile.title===a.id?'EQUIPPED':'SELECT'}</small></button>`;}).join('');
 const earned=ACHIEVEMENTS.filter(x=>save.achievements[x.id]);$('#profile-awards').innerHTML=earned.length?earned.slice(-3).map(x=>`<span class="mini-award">${escapeHTML(x.name)}</span>`).join(''):'<span style="color:#b9d7c2;font-size:11px">Your first treasure is waiting in the games.</span>';
}
function renderTreasures(){const owned=earnedCount(save);$('#treasure-owned').textContent=owned;$('#treasure-progress-fill').style.width=owned/ACHIEVEMENTS.length*100+'%';
 $('#achievement-grid').innerHTML=ACHIEVEMENTS.map(a=>{const yes=!!save.achievements[a.id],value=Math.min(a.goal,metric(save,a));const stamp=yes?new Date(save.achievements[a.id]).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):`${value} / ${a.goal}`;
 return `<article class="achievement ${yes?'earned':'locked'}"><span class="rarity">${escapeHTML(a.rarity).toUpperCase()}</span><div class="achievement-icon">${medalSVG(a.icon)}</div><h3>${escapeHTML(a.name)}</h3><p>${escapeHTML(a.description)}</p><div class="ach-track" aria-label="${yes?'Unlocked':value+' of '+a.goal}"><span style="width:${value/a.goal*100}%"></span></div><div class="ach-footer"><span>${yes?'UNLOCKED':'IN PROGRESS'}</span><span>${escapeHTML(stamp)}</span></div></article>`;}).join('');
}
function renderAll(){applySettings();renderHome();renderProfile();renderTreasures();if($('.section.active')?.id==='game')renderGame();}

function openModal(kind,origin){lastTrigger=origin||document.activeElement;const templates={
 brandle:`<div class="eyebrow">The original grove</div><h2 id="modal-title">BRANDLE is ready.</h2><p>Daily Grove and unlimited Wild Run are already playable at their original address. This opens that game in a new tab, keeping its existing browser saves undisturbed. Cross-game achievements and account syncing will arrive only after a verified migration.</p><div class="code-note">BRANDLE progress stays on its original web address for now. BRANDICADE does not claim its achievements yet.</div><div class="dialog-actions"><a class="btn primary" href="https://brandle-glimmer-grove.devonakins.workers.dev/" target="_blank" rel="noopener noreferrer">Open BRANDLE ↗</a><button class="btn secondary" type="button" data-action="close-modal">Stay here</button></div>`,
 help:`<div class="eyebrow">How to play</div><h2 id="modal-title">Glimmer Pop</h2><p>Swap two neighboring charms with a tap or swipe. Match three of the same kind in a row or column to clear them. Bigger matches create special bursts and chains. Collect the glowing target before your moves run out.</p><p>Complete levels to earn stars, XP, glow petals and real achievements. Replay as often as you want — there are no lives to buy or timer penalties.</p><div class="dialog-actions"><button class="btn primary" data-action="close-modal" type="button">Let's play →</button></div>`,
 settings:`<div class="eyebrow">Make yourself comfortable</div><h2 id="modal-title">Arcade settings.</h2><div class="setting-item"><div><b>Sound effects</b><small>Original little chimes when playing and earning rewards.</small></div><button class="switch ${save.settings.sound?'on':''}" role="switch" type="button" aria-label="Sound effects" aria-checked="${save.settings.sound}" data-toggle="sound"></button></div>
 <div class="setting-item"><div><b>Animation intensity</b><small>System respects reduced-motion preferences. Calm minimizes effects.</small></div><select data-select="motion" aria-label="Animation intensity"><option value="system" ${save.settings.motion==='system'?'selected':''}>System</option><option value="on" ${save.settings.motion==='on'?'selected':''}>Cinematic</option><option value="off" ${save.settings.motion==='off'?'selected':''}>Calm</option></select></div>
 <div class="setting-item"><div><b>High contrast</b><small>Increase text and card-edge contrast.</small></div><button class="switch ${save.settings.contrast?'on':''}" role="switch" type="button" aria-label="High contrast" aria-checked="${save.settings.contrast}" data-toggle="contrast"></button></div>
 <div class="setting-item"><div><b>Charm labels</b><small>Add a small letter to each piece as a color-independent cue.</small></div><button class="switch ${save.settings.colorAssist?'on':''}" role="switch" type="button" aria-label="Charm labels" aria-checked="${save.settings.colorAssist}" data-toggle="colorAssist"></button></div>
 <h3>Progress &amp; privacy</h3><p>This version keeps Brandi's profile on the current browser only. There is no real signed-in cloud account yet. Export to move devices or keep a permanent backup.</p><div class="dialog-actions"><button class="btn secondary" data-action="export" type="button">Export backup ↓</button><button class="btn secondary" data-action="import" type="button">Import backup ↑</button></div><div class="settings-note">No advertising, analytics, subscriptions, paid lives, public rankings, or external account data. This project's code can be public while personal saved data stays private.</div>`,
 levels:`<div class="eyebrow">Your little adventure map</div><h2 id="modal-title">The Garden Trail</h2><p>Replay unlocked levels whenever you want. Finished levels keep their best stars. The next level opens when you win.</p><div class="level-map">${Array.from({length:Math.min(save.progression.unlockedLevel+4,18)},(_,i)=>i+1).map(l=>{const unlocked=l<=save.progression.unlockedLevel,stars=save.progression.levels[String(l)]?.stars||0;return `<button class="level-node" data-level="${l}" type="button" ${unlocked?'':'disabled'}><b>${String(l).padStart(2,'0')}</b><span>${unlocked?levelSpec(l).title:'Locked'}</span><small>${unlocked?(stars?'★'.repeat(stars):'AVAILABLE'):'FINISH PRIOR LEVEL'}</small></button>`}).join('')}</div>`,
 restart:`<div class="eyebrow">Another attempt</div><h2 id="modal-title">Start fresh?</h2><p>Restarting resets the current Glimmer Pop level's board, moves and score. Previously earned stars, XP and achievements stay safe.</p><div class="dialog-actions"><button class="btn primary" data-action="confirm-restart" type="button">Restart this level</button><button class="btn secondary" data-action="close-modal" type="button">Keep playing</button></div>`,
 import:`<div class="eyebrow">Restore a saved garden</div><h2 id="modal-title">Replace local progress?</h2><p>A valid BRANDICADE backup was found. Importing will replace the progress currently saved on this device, including its existing avatar, achievements and active puzzle.</p><p id="import-preview"></p><div class="dialog-actions"><button class="btn primary" data-action="confirm-import" type="button">Yes, restore backup</button><button class="btn secondary" data-action="close-modal" type="button">Cancel</button></div>`,
 };$('#modal-body').innerHTML=templates[kind]||templates.help;if(kind==='import'&&importPending){$('#import-preview').textContent=`Backup: Level ${importPending.progression.level}, ${Object.keys(importPending.achievements).length} achievements, ${importPending.progression.totalStars} stars.`;}
 $('#modal').classList.add('open');$('#modal-close').focus();}
function closeModal(){if($('#modal').classList.contains('open')){$('#modal').classList.remove('open');$('#modal-body').replaceChildren();lastTrigger?.focus?.();}}
function startRun(level){save.currentRun=makeRun(level);selected=null;commit();renderAll();navigate('game');toast(`Level ${level} · ${levelSpec(level).title}`);sound('tap');}
function chooseCell(i){if(moving||ensureRun().ended)return;if(selected===null){selected=i;setSelection();sound();return;}
 if(selected===i){selected=null;setSelection();return;}
 if(!adjacent(selected,i)){selected=i;setSelection();sound();return;}
 const from=selected;selected=null;performSwap(from,i);}
function setSelection(){$$('#pop-board .charm').forEach(e=>{const on=Number(e.dataset.cell)===selected;e.classList.toggle('selected',on);e.setAttribute('aria-pressed',String(on))});}
function animateMove(a,b){const board=$('#pop-board');const one=board.querySelector(`[data-cell="${a}"]`),two=board.querySelector(`[data-cell="${b}"]`);if(!one||!two||!activeMotion())return Promise.resolve();const ar=one.getBoundingClientRect(),br=two.getBoundingClientRect(),dx=br.left-ar.left,dy=br.top-ar.top;
 const options={duration:170,easing:'cubic-bezier(.2,.85,.2,1)',fill:'both'};const p1=one.animate([{transform:'translate(0,0)'},{transform:`translate(${dx}px,${dy}px)`}],options);const p2=two.animate([{transform:'translate(0,0)'},{transform:`translate(${-dx}px,${-dy}px)`}],options);return Promise.allSettled([p1.finished,p2.finished]);}
async function performSwap(a,b){if(moving||ensureRun().ended)return;const current=save.currentRun;const result=trySwap(current,a,b);
 if(!result.ok){sound('wrong');haptic();setSelection();toast(result.reason==='no-match'?'That swap needs to make a match.':'Choose two neighboring charms.');return;}
 moving=true;await animateMove(a,b);save.currentRun=result.run;const awarded=recordTurn(save,result.event);let ended=null;if(result.run.ended)ended=recordEnd(save,result.run);
 commit();renderGame();renderHome();renderProfile();renderTreasures();moving=false;
 const ev=result.event;const msg=ev.chain>=3?`Incredible chain ×${ev.chain}! +${ev.gained.toLocaleString()}`:ev.chain>=2?`Gorgeous cascade ×${ev.chain}! +${ev.gained.toLocaleString()}`:`+${ev.gained.toLocaleString()} · ${ev.goal} collected`;
 $('#game-live').textContent=msg;sound(result.run.won?'win':ev.chain>=2?'award':'match');haptic();if(activeMotion()){$('#pop-board').classList.add('pulsing');setTimeout(()=>$('#pop-board').classList.remove('pulsing'),310);}
 if(awarded.newAwards.length||ended?.newAwards.length){const all=[...awarded.newAwards,...(ended?.newAwards||[])];toast(`Treasure unlocked: ${all.map(x=>x.name).join(', ')}`);confetti(44);}else if(ended?.newLevel){toast(`Arcade level up! Welcome to level ${ended.newLevel}.`);confetti(38);}else if(result.run.won){toast(`Level complete! ${result.run.stars} star${result.run.stars===1?'':'s'} earned.`);confetti(45);}else if(result.run.ended){toast('You can retry any time. No lives or penalties.');}
}
function handleHint(){if(ensureRun().ended)return;const move=findMove(save.currentRun.board);if(!move){toast('The garden is preparing new moves.');return;}
 for(const id of [move.from,move.to]){$(`#pop-board [data-cell="${id}"]`)?.classList.add('hinted');}
 setTimeout(()=>$$('#pop-board .hinted').forEach(x=>x.classList.remove('hinted')),2100);$('#game-live').textContent='Try swapping those two glowing charms.';sound();}
function settingsToggle(key){if(!Object.hasOwn(save.settings,key)||typeof save.settings[key]!=='boolean')return;save.settings[key]=!save.settings[key];commit();applySettings();openModal('settings',lastTrigger);}
function doExport(){const str=exportSave(save);const file=new Blob([str],{type:'application/json'});const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=`BRANDICADE-Brandi-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);toast('A portable progress backup was prepared.');}

// Central event delegation keeps controls keyboard and touch accessible.
document.addEventListener('click',event=>{const target=event.target;
 const cell=target.closest?.('[data-cell]');if(cell&&Date.now()>ignoreClickUntil){chooseCell(Number(cell.dataset.cell));return;}
 const action=target.closest?.('[data-action]');if(action){const type=action.dataset.action;switch(type){
  case 'play':sound();navigate('game');break;
  case 'brandle':sound();openModal('brandle',action);break;
  case 'game-help':openModal('help',action);break;
  case 'open-settings':case 'settings':openModal('settings',action);break;
  case 'close-modal':closeModal();break;
  case 'export':doExport();break;
  case 'import':$('#import-file').click();break;
  case 'hint':handleHint();break;
  case 'restart':openModal('restart',action);break;
  case 'confirm-restart':{const level=save.currentRun?.level||1;closeModal();startRun(level);break;}
  case 'next':{if(!save.currentRun?.won)return;startRun(save.currentRun.level+1);break;}
  case 'replay':{startRun(save.currentRun?.level||1);break;}
  case 'levels':openModal('levels',action);break;
  case 'confirm-import':{if(!importPending)return;save=importPending;importPending=null;commit();closeModal();renderAll();navigate('home');toast('Your saved garden has been restored.');break;}
 }return;}
 const nav=target.closest?.('[data-go]');if(nav){closeModal();navigate(nav.dataset.go);sound();return;}
 const avatar=target.closest?.('[data-avatar]');if(avatar){const id=avatar.dataset.avatar;if(AVATARS.some(x=>x.id===id)){save.profile.avatar=id;commit();renderProfile();sound();}return;}
 const frame=target.closest?.('[data-frame]');if(frame){const id=frame.dataset.frame,def=FRAMES.find(x=>x.id===id);if(def&&save.progression.level>=def.level){save.profile.frame=id;commit();renderProfile();sound();}return;}
 const title=target.closest?.('[data-title]');if(title){const id=title.dataset.title,def=TITLES.find(x=>x.id===id);if(def&&save.progression.level>=def.level){save.profile.title=id;commit();renderProfile();sound();}return;}
 const toggle=target.closest?.('[data-toggle]');if(toggle){settingsToggle(toggle.dataset.toggle);sound();return;}
 const level=target.closest?.('[data-level]');if(level){const l=Number(level.dataset.level);if(l>=1&&l<=save.progression.unlockedLevel){closeModal();startRun(l);}return;}
 if(target.id==='modal')closeModal();
});
$('#settings-open').addEventListener('click',e=>openModal('settings',e.currentTarget));
$('#modal-close').addEventListener('click',closeModal);
$('#brand-home').addEventListener('click',e=>{e.preventDefault();navigate('home');});
document.addEventListener('change',event=>{const select=event.target.closest?.('[data-select]');if(select?.dataset.select==='motion'){save.settings.motion=['system','on','off'].includes(select.value)?select.value:'system';commit();applySettings();toast(save.settings.motion==='off'?'Calm effects enabled.':'Animation preference saved.');}});
$('#import-file').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>512000)throw Error('Backup is too large.');importPending=importSave(await file.text());closeModal();openModal('import',$('#settings-open'));}catch(err){importPending=null;toast(err.message||'This backup could not be imported.');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal();selected=null;setSelection();return;}
 const cell=event.target.closest?.('[data-cell]');if(!cell)return;const idx=Number(cell.dataset.cell),d={ArrowUp:-SIZE,ArrowDown:SIZE,ArrowLeft:-1,ArrowRight:1}[event.key];if(d===undefined)return;const next=idx+d;if(adjacent(idx,next)){event.preventDefault();$(`#pop-board [data-cell="${next}"]`)?.focus();}});
let gesture=null;
$('#pop-board').addEventListener('pointerdown',event=>{const cell=event.target.closest('[data-cell]');if(!cell)return;gesture={idx:Number(cell.dataset.cell),x:event.clientX,y:event.clientY};});
$('#pop-board').addEventListener('pointerup',event=>{if(!gesture)return;const {idx,x,y}=gesture;gesture=null;const dx=event.clientX-x,dy=event.clientY-y;if(Math.hypot(dx,dy)<24)return;const target=Math.abs(dx)>Math.abs(dy)?idx+(dx>0?1:-1):idx+(dy>0?SIZE:-SIZE);ignoreClickUntil=Date.now()+300;if(adjacent(idx,target))performSwap(idx,target);});
$('#pop-board').addEventListener('pointercancel',()=>{gesture=null});
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home',true));
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'home',true));
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',applySettings);

// Ambient 2D light motes; deliberately independent of gameplay and optional.
function startAmbient(){const canvas=$('#fireflies'),ctx=canvas.getContext('2d');if(!ctx)return;let particles=[],width=0,height=0,dpr=1,time=0,last=0;
 function resize(){width=window.innerWidth;height=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);const count=Math.min(44,Math.floor(width*height/26000));particles=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,phase:Math.random()*6.28,s:.18+Math.random()*.36,r:.65+Math.random()*1.6,color:Math.random()>.45?'93,234,189':'244,175,115'}));}
 resize();window.addEventListener('resize',resize,{passive:true});
 function loop(stamp){requestAnimationFrame(loop);if(document.hidden||!activeMotion()){if(last){ctx.clearRect(0,0,width,height);last=0;}return;}if(stamp-last<33)return;last=stamp;time+=.018;ctx.clearRect(0,0,width,height);
 for(const p of particles){p.y-=p.s;p.x+=Math.sin(time+p.phase)*.16;if(p.y<-14){p.y=height+14;p.x=Math.random()*width;}const r=p.r*5,a=.14+.3*(.5+.5*Math.sin(time*1.6+p.phase));const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);grad.addColorStop(0,`rgba(${p.color},${a})`);grad.addColorStop(1,`rgba(${p.color},0)`);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();}}
 requestAnimationFrame(loop);}
startAmbient();saveVisited();renderAll();navigate(location.hash.slice(1)||'home',true);
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
