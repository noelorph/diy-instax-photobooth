// Editable Booth proposal. This file is Figma drawing source, never production UI.
const page = await figma.getNodeByIdAsync('3:2');
await figma.setCurrentPageAsync(page);
const boothFrames = {};
const B = { mist:'#BCC7BD', panel:'#303B33', soft:'#E3E9DE', sand:'#DCC5AE', clay:'#C37158' };
function centered(p,s,size=22,color='ink',style='Regular',w=inner(p),font='Manrope') {
  const n=txt(p,s,size,color,style,w,font);n.textAlignHorizontal='CENTER';return n;
}
function fixedBox(p,name,w,h,bg=null,gap=20) {
  const n=box(p,name,w,gap,0,bg);n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisAlignItems='CENTER';n.primaryAxisAlignItems='CENTER';return n;
}
function boothSvg(p,name,body,w,h,view='0 0 400 400') {
  const n=track(figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="'+view+'">'+body+'</svg>'));
  n.name=name;n.resize(w,h);p.appendChild(n);return n;
}
function instantArt(p,variant='camera',w=344,h=300) {
  const ink=C.ink,cream=C.paper,accent=C.accent,green='#78917A',clay='#D39C83';
  let content='';
  if(variant==='camera')content='<ellipse cx="200" cy="355" rx="136" ry="16" fill="'+ink+'" opacity=".08"/><path d="M66 106C18 183 30 291 138 314c90 20 219-5 233-95C385 124 284 52 194 69 133 80 95 58 66 106Z" fill="'+C.accentSoft+'"/><rect x="79" y="132" width="244" height="168" rx="34" fill="'+cream+'" stroke="'+ink+'" stroke-width="6"/><path d="M146 131v-23c0-9 7-16 16-16h79c9 0 16 7 16 16v23" fill="'+clay+'" stroke="'+ink+'" stroke-width="6"/><rect x="101" y="155" width="55" height="24" rx="7" fill="'+green+'"/><circle cx="215" cy="215" r="62" fill="'+accent+'"/><circle cx="215" cy="215" r="45" fill="'+ink+'"/><circle cx="215" cy="215" r="31" fill="'+green+'"/><circle cx="204" cy="204" r="12" fill="'+cream+'"/><circle cx="294" cy="165" r="9" fill="'+ink+'"/><path d="M46 78v24m-12-12h24M349 76v32m-16-16h32M355 284v20m-10-10h20" stroke="'+accent+'" stroke-width="5" stroke-linecap="round"/>';
  else if(variant==='print')content='<ellipse cx="200" cy="354" rx="124" ry="13" fill="'+ink+'" opacity=".12"/><rect x="96" y="157" width="208" height="150" rx="34" fill="'+cream+'"/><rect x="121" y="181" width="158" height="12" rx="6" fill="'+ink+'"/><circle cx="276" cy="267" r="7" fill="'+green+'"/><path d="M140 184V42h120v142" fill="'+cream+'" stroke="'+cream+'" stroke-width="10"/><rect x="151" y="49" width="98" height="105" fill="'+green+'"/><path d="M151 127l32-33 24 25 19-17 23 29v23h-98Z" fill="'+clay+'"/><circle cx="223" cy="76" r="12" fill="'+cream+'"/><path d="M61 163v24m-12-12h24M335 99v26m-13-13h26" stroke="'+clay+'" stroke-width="5" stroke-linecap="round"/>';
  else if(variant==='complete')content='<circle cx="200" cy="192" r="147" fill="'+C.successSoft+'"/><rect x="112" y="62" width="176" height="247" rx="6" fill="'+cream+'" stroke="'+ink+'" stroke-width="3"/><rect x="128" y="78" width="144" height="170" fill="'+green+'"/><path d="M200 204c-50-30-66-60-44-79 19-17 37-1 44 9 7-10 25-26 44-9 22 19 6 49-44 79Z" fill="'+cream+'"/><path d="M59 105v24m-12-12h24M328 251v26m-13-13h26" stroke="'+accent+'" stroke-width="5" stroke-linecap="round"/><circle cx="298" cy="91" r="34" fill="'+C.success+'"/><path d="m283 91 10 10 20-22" fill="none" stroke="'+cream+'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
  return boothSvg(p,'Original illustration / '+variant,content,w,h);
}
function portrait(p,w=420,mode='preview') {
  const h=w*4/3;
  const art=boothSvg(p,'Illustrative '+mode+' / native vectors, 3:4 crop','<g transform="'+(mode==='preview'?'translate(300 0) scale(-1 1)':'translate(0 0)')+'"><rect width="300" height="400" fill="#B9C5AE"/><path d="M0 0h100v400H0Z" fill="#95AA90"/><path d="M230 0h70v400h-70Z" fill="#D7DCC9"/><path d="M0 339c22-68 65-102 123-80 42 16 51 56 45 141H0Z" fill="#C57B63"/><path d="M135 400c-5-98 8-140 61-154 60-16 91 43 104 91v63Z" fill="#475F51"/><ellipse cx="99" cy="189" rx="51" ry="68" fill="#E7BDA2"/><path d="M47 190c-11-76 13-109 62-109 40 0 57 35 46 78-22-2-38-11-45-34-11 35-25 44-63 48Z" fill="#353C33"/><path d="M48 194c-12 20-13 43-5 65l24-13-7-50Z" fill="#353C33"/><ellipse cx="207" cy="171" rx="46" ry="65" fill="#BF896B"/><path d="M165 143c-4-56 28-83 65-58 20 14 26 37 20 65-26-9-39-21-43-35-12 15-26 22-42 28Z" fill="#303A31"/><path d="M72 209q24 18 47 0M189 193q18 15 35 0" fill="none" stroke="#684935" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="183" r="3" fill="#353C33"/><circle cx="117" cy="183" r="3" fill="#353C33"/><circle cx="191" cy="168" r="3" fill="#353C33"/><circle cx="222" cy="168" r="3" fill="#353C33"/><path d="M24 26h28M24 26v28m252-28h-28m28 0v28M24 374h28m-28 0v-28m252 28h-28m28 0v-28" stroke="#F7F4EE" stroke-width="3" fill="none"/></g>',w,h,'0 0 300 400');
  art.cornerRadius=20;art.clipsContent=true;
  return art;
}
function boothBase(id,name,index,dark=false,landscape=false) {
  const w=landscape?1180:820,h=landscape?820:1180;
  const f=artboard(id+' · '+name,w,h,index,5,100,dark?'night':'paper');
  if(landscape){f.x=100+(index%3)*1280;f.y=8500+Math.floor(index/3)*970;}
  f.paddingTop=f.paddingBottom=40;f.paddingLeft=f.paddingRight=48;f.itemSpacing=0;
  const head=fixedBox(f,'Brand',inner(f),40,null,0);
  centered(head,'INSTAX  /  BOOTH',14,dark?B.mist:'muted','Bold');
  const main=fixedBox(f,'Guest content',inner(f),h-160,null,24);
  const foot=fixedBox(f,'Reassurance',inner(f),40,null,0);
  centered(foot,'Your photo is never saved.',15,dark?B.mist:'muted');
  boothFrames[id]=f;
  return {f,main,foot,dark,w,h};
}
function captionBooth(f,condition) {caption(f,condition);}
function statusSymbol(p,name,tone='warning',size=156) {
  const wrap=fixedBox(p,'State symbol / '+name,size,size,tone==='success'?'successSoft':tone==='neutral'?B.panel:'warningSoft',0);wrap.cornerRadius=size/2;
  icon(wrap,name,60,tone==='neutral'?'paper':tone);
  return wrap;
}
function stateText(p,titleText,body,color='surface',size=40) {
  const g=box(p,'Message',Math.min(inner(p),640),14,0);g.counterAxisAlignItems='CENTER';
  centered(g,titleText,size,color,'SemiBold');
  if(body)centered(g,body,23,color==='surface'?B.mist:'muted');
  return g;
}
function recovery(id,name,index,opts) {
  const s=boothBase(id,name,index,true);const m=s.main;m.itemSpacing=32;
  statusSymbol(m,opts.icon||'TriangleAlert',opts.tone||'warning');
  stateText(m,opts.title,opts.body||'Please inform the Admin.');
  if(opts.detail){const d=box(m,'Supporting status',592,12,22,B.panel);d.cornerRadius=18;centered(d,opts.detail,19,'paper');}
  if(opts.action)button(m,opts.action,'primary',440,72);
  if(opts.note)centered(m,opts.note,16,B.mist,'Regular',560);
  captionBooth(s.f,opts.condition);return s;
}

// Primary journey: every artboard contains editable text, native vector artwork, and component instances.
{
  const s=boothBase('B01','Welcome / default',0);const m=s.main;m.itemSpacing=24;
  instantArt(m,'camera',392,340);
  centered(m,'A LITTLE MOMENT, YOURS TO KEEP',12,'accent','Bold');
  centered(m,'Make a memory.\nTake it with you.',45,'ink','Regular',680,'Libre Baskerville');
  centered(m,'One photo. One instant print.',23,'muted');
  spacer(m,8);button(m,'Start','primary',500,72);
  captionBooth(s.f,'Default welcome · optional media unavailable · Start admits a guest only with fresh readiness.');
}
{
  const s=boothBase('B02','Camera preview',1,true);const m=s.main;m.itemSpacing=20;
  stateText(m,'Your moment starts here.','Find your spot. Then take your photo.', 'surface',34);
  portrait(m,420);button(m,'Take Photo','primary',520,72);
  captionBooth(s.f,'Mirrored live preview · 3:4 crop · artwork is an editable specimen, not a retained Guest photo.');
}
{
  const s=boothBase('B03','Countdown',2,true);const m=s.main;m.itemSpacing=24;
  centered(m,'Hold that smile.',34,'surface','SemiBold');
  const sample=portrait(m,450);const over=fixedBox(sample,'Countdown overlay',450,600,null,0);over.x=0;over.y=0;
  const disk=fixedBox(over,'Countdown numeral',192,192,'paper',0);disk.cornerRadius=96;centered(disk,'3',116,'ink','ExtraBold');
  centered(m,'3  ·  2  ·  1',20,B.mist,'SemiBold');
  captionBooth(s.f,'3 → 2 → 1 → exactly one shutter · no inactivity timeout or duplicate action.');
}
{
  const s=boothBase('B04','Photo review',3,true);const m=s.main;m.itemSpacing=20;
  stateText(m,'A keeper?','This is how your photo will print.','surface',36);
  const mount=box(m,'Instant photo review',444,0,12,'paper');mount.paddingBottom=40;mount.cornerRadius=7;portrait(mount,420,'review');
  const actions=row(m,'Review choices',16,600);button(actions,'Retake','secondary',220,72);button(actions,'Print','primary',364,72);
  captionBooth(s.f,'Unmirrored final crop · Retake returns to live preview · Print selects this acknowledged Capture.');
}
{
  const s=boothBase('B05','Inactivity warning',4,true);const m=s.main;m.itemSpacing=24;
  statusSymbol(m,'Clock','neutral');stateText(m,'Still finding your moment?','Tap Continue to keep taking your photo.');
  const countdown=box(m,'Expiry notice',580,10,24,B.panel);countdown.cornerRadius=18;centered(countdown,'This session will end in 15 seconds.',22,'paper','SemiBold');centered(countdown,'Your photo will be discarded.',18,B.mist);
  button(m,'Continue','primary',440,72);
  captionBooth(s.f,'75-second capture/review warning · Continue resets timer · abandon at 90 seconds.');
}
[
  ['B06','Preparing your print','Preparing your print.','Getting your photo ready.','Preparing','Capture acknowledged; reserve selected image. No percentage or estimated completion time.'],
  ['B07','Sending to Instax','Sending your photo.','Your print is on its way to the printer.','Sending','One authorized send only. A command acknowledgement is not a completed print.'],
  ['B08','Waiting for ejection','Printing your moment.','Please wait for your photo to come out.','Printing','Wait for qualified full ejection and server acknowledgement. No automatic resend.']
].forEach((d,i)=>{
  const s=boothBase(d[0],d[1],5+i,true);const m=s.main;m.itemSpacing=28;
  instantArt(m,'print',340,340);stateText(m,d[2],d[3]);
  const phases=row(m,'Actual print phase',14,570);phases.counterAxisAlignItems='CENTER';
  ['Preparing','Sending','Printing'].forEach((phase,j)=>{const item=box(phases,phase,180,8,0);centered(item,phase,17,j===i?'surface':B.mist,j===i?'Bold':'Regular');const line=track(figma.createRectangle());line.resize(180,j===i?4:2);fill(line,j===i?'accent':B.panel);item.appendChild(line);});
  captionBooth(s.f,d[5]);
});
{
  const s=boothBase('B09','Print complete',8);const m=s.main;m.itemSpacing=22;
  instantArt(m,'complete',380,380);centered(m,'PRINT COMPLETE',12,'success','Bold');
  centered(m,'A memory to hold.',42,'ink','Regular',680,'Libre Baskerville');
  centered(m,'Your photo is ready. Enjoy it!',24,'muted');
  captionBooth(s.f,'Show for 3 seconds only after full ejection + recorded outcome · no Guest photo retained.');
}

// Distinct recovery meanings and permissions; no action retries the old photo.
const recoveryCases=[
 ['B10','Bluetooth disconnected',{icon:'BluetoothOff',title:'Bluetooth disconnected.',action:'Connect to Instax',condition:'Local connection only; failed chooser stays blocked. Reconcile old attempt before fresh welcome.'}],
 ['B11','Camera disconnected',{icon:'CameraOff',title:'Camera disconnected.',action:'Enable Camera',condition:'Permission and actual live feed must recover; if a print is active, settle it before camera recovery.'}],
 ['B12','Camera permission denied',{icon:'CameraOff',title:'Camera disconnected.',detail:'Camera access is still off. Allow camera access when prompted.',action:'Enable Camera',condition:'Permission-denied variant retains the camera blocker and permitted action; no local Admin sign-in.'}],
 ['B13','Wi-Fi disconnected',{icon:'WifiOff',title:'Wi-Fi disconnected.',detail:'We’ll check the connection automatically.',condition:'Detected offline connectivity only. Discard old photo, reconcile after reconnect, no retry button.'}],
 ['B14','Connection unavailable',{icon:'CloudOff',title:'Connection unavailable.',detail:'We’re checking the connection.',condition:'RPC/HTTP failure with connectivity unknown. Do not claim that Wi-Fi is disconnected.'}],
 ['B15','Printer out of film',{icon:'Film',title:'Printer is out of film.',condition:'Only reliable qualified no-film classification. Phone shows Film reload needed; capacity is unchanged.'}],
 ['B16','Temporarily unavailable',{icon:'TriangleAlert',title:'Booth is temporarily\nunavailable.',condition:'Unclassified fault, jam, cover, low power, or unknown readiness. No invented diagnosis or auto-success.'}],
 ['B17','Last print unresolved',{icon:'Clock',title:'Booth is temporarily\nunavailable.',detail:'The last print needs to be checked before another photo can start.',condition:'Unknown possible delivery holds one print and blocks admission. Phone inspection only, with reason.'}],
 ['B18','Pending print + Bluetooth lost',{icon:'BluetoothOff',title:'Booth is temporarily\nunavailable.',detail:'Bluetooth disconnected. Please inform the Admin.',action:'Connect to Instax',condition:'Pending has priority; needed Bluetooth recovery stays visible. Reconnection never resolves the print.'}],
 ['B19','Booked prints exhausted',{icon:'PackagePlus',title:'All booked prints\nhave been used.',body:'Please ask the Admin to add another Film Package.',condition:'No pending attempt. Whole package addition changes capacity; physical reload does not.'}],
 ['B20','Booth paused',{icon:'Pause',tone:'neutral',title:'Booth paused.',body:'The Admin will resume the booth when it’s ready.',condition:'Explicit pause persists through every recovery. Resume is authenticated on the phone.'}],
 ['B21','Paused + Bluetooth lost',{icon:'Pause',tone:'neutral',title:'Booth paused.',body:'The Admin will resume the booth when it’s ready.',detail:'Bluetooth disconnected. Please inform the Admin.',action:'Connect to Instax',condition:'Necessary recovery remains available while Paused; reconnect never clears the Admin pause.'}],
 ['B22','Finishing Booth Mode',{icon:'Clock',tone:'neutral',title:'Finishing Booth Mode',body:'Please wait while the last print is resolved.',condition:'No new work. Finishing waits for terminal outcome and cannot be reversed with Resume.'}],
 ['B23','Booth Mode finished',{icon:'CircleCheck',tone:'success',title:'Booth Mode finished',body:'Thank you for making memories with us.',action:'Sign in',condition:'No Event/contact data. Access revoked; Event remains Live until separately completed.'}],
 ['B24','Booth access ended',{icon:'LockKeyhole',tone:'neutral',title:'Booth access ended.',action:'Sign in',condition:'Missing/expired/revoked grant. Exceptional local setup only after old work is resolved from phone.'}],
 ['B25','Finishing + reconnect required',{icon:'Clock',tone:'neutral',title:'Finishing Booth Mode',body:'The last print still needs to be resolved.',detail:'Bluetooth disconnected. Please inform the Admin.',action:'Connect to Instax',condition:'Finishing remains principal status; connection recovery can collect old outcome, never dispatch new work.'}]
];
recoveryCases.forEach(([id,name,o],i)=>recovery(id,name,9+i,o));
recovery('B30','Paused + unresolved print',25,{icon:'Pause',tone:'neutral',title:'Booth paused.',body:'The Admin will resume the booth when it’s ready.',detail:'The last print still needs to be checked. Please inform the Admin.',condition:'Paused stays principal. An unresolved print still holds capacity and blocks Resume; show truthful recovery status.'});

// Landscape reference reflows content; the portrait photo crop stays unchanged.
{
 const s=boothBase('B26','Welcome / landscape',0,false,true);const content=row(s.main,'Landscape welcome',60,1084);content.counterAxisAlignItems='CENTER';
 const left=fixedBox(content,'Original camera',420,540);instantArt(left,'camera',400,390);
 const right=box(content,'Welcome copy and action',604,24);centered(right,'A LITTLE MOMENT, YOURS TO KEEP',12,'accent','Bold');centered(right,'Make a memory.\nTake it with you.',40,'ink','Regular',604,'Libre Baskerville');centered(right,'One photo. One instant print.',22,'muted');spacer(right,4);button(right,'Start','primary',604,72);
 captionBooth(s.f,'1180 × 820 landscape · illustration and action reflow side by side; no browser/device qualification implied.');
}
{
 const s=boothBase('B27','Camera preview / landscape',1,true,true);const content=row(s.main,'Landscape capture',76,1084);content.counterAxisAlignItems='CENTER';
 const photo=fixedBox(content,'Portrait preview crop',420,590);portrait(photo,408);
 const right=box(content,'Capture controls',588,28);stateText(right,'Your moment\nstarts here.','Find your spot. Then take your photo.','surface',38);button(right,'Take Photo','primary',588,72);
 captionBooth(s.f,'Landscape shell, portrait 3:4 mirrored preview · large action stays clear of camera crop.');
}
{
 const s=boothBase('B28','Photo review / landscape',2,true,true);const content=row(s.main,'Landscape review',76,1084);content.counterAxisAlignItems='CENTER';
 const mount=box(content,'Instant photo review',420,0,12,'paper');mount.paddingBottom=34;mount.cornerRadius=7;portrait(mount,396,'review');
 const right=box(content,'Review choices',588,28);stateText(right,'A keeper?','This is how your photo will print.','surface',40);button(right,'Print','primary',588,72);button(right,'Retake','secondary',588,72);
 captionBooth(s.f,'Unmirrored final crop is never stretched to landscape; Print/Retake remain separate and large.');
}
{
 const s=boothBase('B29','Bluetooth recovery / landscape',3,true,true);const content=row(s.main,'Landscape recovery',76,1084);content.counterAxisAlignItems='CENTER';
 const left=fixedBox(content,'Connection symbol',400,490);statusSymbol(left,'BluetoothOff','warning',220);
 const right=box(content,'Recovery controls',608,28);stateText(right,'Bluetooth disconnected.','Please inform the Admin.','surface',38);button(right,'Connect to Instax','primary',608,72);
 captionBooth(s.f,'Landscape recovery template · one permitted local action, no sign-in or print retry.');
}
return audit();
