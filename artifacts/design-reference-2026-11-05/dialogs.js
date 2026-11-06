// Proposal drawing source; concatenate after figma-icons.js and figma-helpers.js.
const dialogsPage = await figma.getNodeByIdAsync('3:3');
await figma.setCurrentPageAsync(dialogsPage);

function referenceBoard(name,index){
  const f=artboard(name,1200,1100,index,3,100);
  f.paddingLeft=f.paddingRight=64;f.paddingTop=f.paddingBottom=56;f.itemSpacing=22;
  return f;
}
function twoColumns(p,leftName,rightName){
  const r=row(p,'Two columns',28);const w=(inner(p)-28)/2;
  return [box(r,leftName,w,18),box(r,rightName,w,18)];
}
function source(p,label,url,note){
  const n=box(p,'Source / '+label,inner(p),5);
  txt(n,label,16,'ink','Bold');
  const link=txt(n,url,12,'accent');link.hyperlink={type:'URL',value:url};
  txt(n,note,13,'muted');
}
function checkedRow(p,label,checked=false){
  const r=row(p,'Confirmation',12);
  const s=box(r,'Checkbox',24,0,0,checked?'accent':'surface');s.resize(24,24);s.primaryAxisSizingMode='FIXED';s.cornerRadius=5;s.strokes=[paint(checked?'accent':'muted')];
  if(checked){icon(s,'Check',20,'surface');s.paddingLeft=s.paddingTop=2;}
  txt(r,label,14,'ink','Medium',inner(p)-36);
}
function dialogue(name,index,iconName,heading,body,render,actions,note,tone='accent'){
  const f=artboard(name,1200,1100,index,3,100);
  const under=box(f,'Neutral application backdrop',1200,24,64,'paper');under.resize(1200,1100);under.primaryAxisSizingMode='FIXED';
  eyebrow(under,'INSTAX BOOTH');rule(under);
  const dim=track(figma.createRectangle());f.appendChild(dim);dim.name='Modal backdrop';dim.resize(1200,1100);fill(dim,'ink');dim.opacity=.38;dim.layoutPositioning='ABSOLUTE';dim.x=0;dim.y=0;
  const m=card(f,'Dialog / '+heading,480,'surface',28);m.layoutPositioning='ABSOLUTE';m.itemSpacing=18;m.cornerRadius=24;m.strokes=[];
  const head=row(m,'Dialog header',12);const symbol=box(head,'State icon',48,0,12,tone==='accent'?'accentSoft':tone+'Soft');symbol.cornerRadius=14;icon(symbol,iconName,24,tone);
  const gap=box(head,'Header spacer',308,0);gap.resize(308,48);gap.primaryAxisSizingMode='FIXED';
  const close=box(head,'Close dialog / 44 px target',44,0,12);close.resize(44,44);close.primaryAxisSizingMode='FIXED';icon(close,'X',20,'muted');
  title(m,heading,28);if(body)txt(m,body,15,'muted');
  if(render)render(m);
  rule(m);
  if(actions.length===2){const a=row(m,'Dialog actions',12);const w=(inner(m)-12)/2;actions.forEach(([label,kind])=>button(a,label,kind,w));}
  else actions.forEach(([label,kind])=>button(m,label,kind));
  m.x=(f.width-m.width)/2;m.y=Math.max(48,(f.height-m.height)/2);
  caption(f,note);
  return f;
}

const cover=referenceBoard('00 / Instax Booth — new design reference',0);
eyebrow(cover,'ADMIN + BOOTH / DESIGN PROPOSAL / 05 NOVEMBER 2026');
spacer(cover,18);
txt(cover,'A small print.\nA lasting moment.',64,'ink','Regular',950,'Libre Baskerville');
txt(cover,'Instax Booth',24,'accent','Bold');
txt(cover,'An original interface direction for calm Event management and a welcoming, focused iPad photo booth.',23,'muted','Regular',850);
spacer(cover,16);
const coverCols=twoColumns(cover,'Admin collection','Booth collection');
eyebrow(coverCols[0],'01 — ADMIN');
txt(coverCols[0],'Prepare. Manage. Remember.',25,'ink','SemiBold');
txt(coverCols[0],'Dashboard · Events · Draft Editor · Setup · Live Event · Phone recovery · Authentication · History · Profile',16,'muted');
eyebrow(coverCols[1],'02 — BOOTH');
txt(coverCols[1],'One action at a time.',25,'ink','SemiBold');
txt(coverCols[1],'Welcome · Camera · Countdown · Review · Printing · Printed · Connection recovery · Film and capacity · Pause, finish and access',16,'muted');
rule(cover);
notice(cover,'A separate proposal','Existing designs and the references on open issues #30, #34 and #35 are preserved. No product behavior or current design decision is replaced by these frames.','warning');
txt(cover,'Figma Starter check: the new draft was created successfully with three pages. Editable frames share those pages; no per-screen file is required.',15,'muted');
footer(cover,'Fictional content throughout · No Guest photos stored · Design reference, not hardware acceptance');
caption(cover,'REFERENCE NOTE — These editorial annotations sit outside the application screens.');

const foundations=referenceBoard('01 / Foundations — type, color and interaction',1);
eyebrow(foundations,'THE VISUAL LANGUAGE');title(foundations,'Warm paper. Clear decisions.',42);
txt(foundations,'A quiet editorial character, grounded in practical controls and honest state feedback.',19,'muted');
const palettes=row(foundations,'Palette',14);
[['Paper','paper'],['Ink','ink'],['Coral','accent'],['Success','success'],['Attention','warning'],['Error','danger']].forEach(([label,color])=>{
  const p=box(palettes,label,(inner(foundations)-70)/6,9);const sw=box(p,'Swatch',inner(p),0,0,color);sw.resize(inner(p),62);sw.primaryAxisSizingMode='FIXED';sw.cornerRadius=12;txt(p,label,13,'ink','Bold');txt(p,C[color],12,'muted');
});
const foundCols=twoColumns(foundations,'Typography','Components');
eyebrow(foundCols[0],'TYPE / MANROPE + LIBRE BASKERVILLE');
txt(foundCols[0],'Made for the moment.',31,'ink','Italic',inner(foundCols[0]),'Libre Baskerville');
txt(foundCols[0],'A useful heading',28,'ink','SemiBold');
txt(foundCols[0],'Body copy stays direct, readable and reassuring. Buttons describe the action that follows.',16,'muted');
txt(foundCols[0],'Admin 14–16 px body · 28–36 px page titles\nBooth 22–23 px instructions/actions · 34–45 px headings\nCountdown is deliberately larger at 116 px.',13,'muted');
eyebrow(foundCols[1],'CONTROL / EVERY STATE HAS A NAME');
button(foundCols[1],'Primary action','primary');button(foundCols[1],'Secondary action','secondary');button(foundCols[1],'Unavailable action','disabled');
const states=row(foundCols[1],'Statuses',10);badge(states,'Ready','success',94);badge(states,'Pending','warning',104);badge(states,'Error','danger',94);
rule(foundations);
txt(foundations,'Measured color pairs',18,'ink','Bold');
txt(foundations,'Ink / paper 13.29:1 · Muted / white 5.79:1 · Coral / white 5.92:1\nSuccess 6.20:1 · Attention 5.53:1 · Error 5.26:1 on their pale surfaces.',15,'muted');
notice(foundations,'Interaction requirements','48 px Admin actions; 64 px or larger Booth actions. Visible keyboard focus, associated labels and errors, modal focus containment and return. Status always uses words as well as color.','success');
txt(foundations,'Motion stays optional. No progress percentage without measured progress; printing success waits for confirmed ejection. Reduced-motion uses a static welcome; montage remains silent with a pause control.',14,'muted');
caption(foundations,'REFERENCE NOTE — Token pairs calculated with WCAG relative luminance. Prototype rendering is not an accessibility audit.');

const research=referenceBoard('02 / Research, device assumptions and authority',2);
eyebrow(research,'INSPIRATION ONLY — NO COPIED SCREENS');title(research,'Familiar to Guests. Specific to this booth.',36);
const sourcesCols=twoColumns(research,'Inspiration','Constraints');
source(sourcesCols[0],'Simple Booth — appearance','https://help.simplebooth.com/en/articles/1310875-booth-appearance-customizations','Reference principle: a recognizable welcome and restrained event personalization.');
source(sourcesCols[0],'Simple Booth HALO — launch','https://help.simplebooth.com/en/articles/8482291-launching-the-halo-app','Reference principle: separate preparation from the Guest session.');
source(sourcesCols[0],'Snappic — App Experience','https://help.snappic.com/en/articles/11421280-app-experience-settings','Reference principle: separate attract-screen and capture/standby styling. Its extra features are not added here.');
source(sourcesCols[0],'Touchpix — theme reference','https://touchpix.com/api/cms/assets/79494053-a2c8-4488-b41c-b0ce4d5b522c.pdf','Reference principle: consistent stage layouts and prominent touch actions.');
source(sourcesCols[1],'Apple — iPad (A16)','https://support.apple.com/en-us/122240','2360 × 1640 hardware pixels. Portrait design assumes 820 × 1180 CSS pixels at 2×; Bluefy browser chrome/viewport still needs device verification.');
source(sourcesCols[1],'Figma — Starter plan','https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview','New editable draft and three pages successfully created in this account. Multiple frames are grouped per page.');
source(sourcesCols[1],'Figma — pricing FAQ','https://www.figma.com/pricing-faq/','Plan eligibility checked before creating the draft.');
source(sourcesCols[1],'Figma — MCP access limits','https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/','Starter read limits apply; creation/write access verified.');
rule(research);
notice(research,'Behavioral authority','PRD.md, GLOSSARY.md, ARCHITECTURE.md, current ADRs and the package/recovery replacement contract. The ignored DESIGN_SYSTEM.md and docs/design contents were not used as visual inputs.','success');
txt(research,'Hardware gate remains open: real automatic full-ejection completion, recovery and the actual iPad A16 / Bluefy / Mini Link 3 end-to-end trial. These design frames cannot establish physical readiness.',14,'muted');
txt(research,'Public product references inspire interaction principles only. Original composition, colors, typography and wording; no imported competitor artwork or screens.',13,'muted');
caption(research,'REFERENCE NOTE — Sources checked on 05 Nov 2026. All app records shown are fictional.');

dialogue('D01 / Add Film Packages',3,'PackagePlus','Add Film Packages','Mia & Leo’s wedding',m=>{
  field(m,'Additional Film Packages','1');
  const sum=box(m,'Capacity change',inner(m),8,18,'accentSoft');sum.cornerRadius=14;
  txt(sum,'+10 booked prints',25,'accent','Bold');facts(sum,[['Current booked total','60'],['New booked total','70']]);
  field(m,'Client-request note · required','Mia requested one extra package.');
  txt(m,'This addition is permanent. Load physical film separately when the printer needs it.',14,'muted');
},[['Cancel','secondary'],['Add 1 package','primary']],'D01 — Positive whole packages only; required Client-request note. Pending print is unchanged. Receipt recovery cannot add the package twice.');

dialogue('D02 / Confirm physical reload',4,'Film','Confirm film loaded?','Confirm only after physically loading the Instax printer.',m=>{
  facts(m,[['Printer','Instax Mini Link 3'],['Reload requested','2 minutes ago']]);
  checkedRow(m,'I have physically loaded a film package into this printer.',true);
  notice(m,'A pending print still needs an outcome','Reload confirmation changes readiness. It does not add booked prints or settle the old print.','warning');
},[['Not yet','secondary'],['Confirm loaded','primary']],'D02 — Physical reload confirmation is separate from Event capacity and pending outcome. The existing run remains paused if it was paused.');

dialogue('D03 / Resolve pending — Printed',5,'Printer','Was the print fully ejected?','Inspect the printer before choosing an outcome.',m=>{
  const choices=row(m,'Outcome selection',12);button(choices,'Printed','soft',206);button(choices,'Not printed','secondary',206);
  txt(m,'Printed means the sheet fully ejected, even if the image is unusable.',15,'ink');
  field(m,'Reason · required','I saw the sheet fully eject.');
  facts(m,[['Confirmed Prints','37 → 38'],['Pending prints','1 → 0'],['Prints available','22 · unchanged']]);
  notice(m,'This records the inspected outcome','No new print command will be sent.','success');
},[['Keep pending','secondary'],['Confirm Printed','primary']],'D03 — Exceptional phone inspection only. Ordinary success is automatic. Save is unavailable without a reason.','success');

dialogue('D04 / Resolve pending — Not printed blocked',6,'TriangleAlert','Record Not printed?','Only continue when the old job cannot eject later.',m=>{
  const choices=row(m,'Outcome selection',12);button(choices,'Printed','secondary',206);button(choices,'Not printed','soft',206);
  field(m,'Reason · required','No sheet ejected; checking printer.');
  checkedRow(m,'I have established that the old print job has finished or cleared and cannot eject later.',false);
  notice(m,'Keep it pending if you are unsure','The booth stays unavailable while the old print could still eject. Film reload alone does not prove this.','warning');
  txt(m,'Once safely confirmed, the held print is released: 22 → 23 available. The old photo is not retried.',14,'muted');
},[['Keep pending','secondary'],['Confirm Not printed','disabled']],'D04 — Disabled until a reason and safe-clear assurance are present. Unknown outcomes retain both the booked-print hold and printer slot.','warning');

dialogue('D05 / Pause Booth',7,'Pause','Pause Booth?','Guests will see “Booth paused” on the iPad.',m=>{
  notice(m,'A print already sent may still finish','Pause prevents new work. Any possible print must still be resolved.','warning');
  txt(m,'The iPad stays in Booth Mode. Resume from this Event page when the equipment is ready.',15,'muted');
},[['Keep running','secondary'],['Pause Booth','primary']],'D05 — Persistent pause survives equipment reconnection. No routine sign-in or Admin takeover on iPad.');

dialogue('D06 / Resume blocked',8,'TriangleAlert','Not ready to resume','The booth stays paused until these issues are resolved.',m=>{
  notice(m,'Pending print outcome','Inspect the print or wait for reliable printer feedback.','warning');
  notice(m,'Film reload needed','Physically load film, then confirm the reload here.','warning');
  txt(m,'Clearing one issue does not clear the others. Resume remains an explicit Admin action.',14,'muted');
},[['Back to Event','secondary'],['Resume Booth','disabled']],'D06 — Show every independent blocker. Once readiness and access are valid, the Admin may explicitly resume.','warning');

dialogue('D07 / Resume ready',9,'Play','Resume Booth?','The equipment is ready for the next Guest.',m=>{
  const list=box(m,'Readiness',inner(m),12);[['Printer connected','Check'],['Live camera ready','Check'],['Internet connected','Check'],['22 prints available','Check']].forEach(([label,i])=>{const r=row(list,label,12);icon(r,i,20,'success');txt(r,label,15,'ink','Medium',inner(list)-32);});
  txt(m,'The iPad will return to the welcome screen. No new iPad sign-in is needed.',15,'muted');
},[['Keep paused','secondary'],['Resume Booth','primary']],'D07 — Readiness evidence must be current at commit; stale state returns an actionable blocker instead of claiming success.','success');

dialogue('D08 / Finish Booth Mode',10,'Power','Finish Booth Mode?','End this Booth run when the last possible print is settled.',m=>{
  notice(m,'1 print still pending','Guests cannot start another session. Finishing waits for the print outcome.','warning');
  txt(m,'A command already sent may still print. The iPad will show “Booth Mode finished” and Sign in when this run is finished.',15,'muted');
  const n=box(m,'Event remains Live',inner(m),8,18,'accentSoft');n.cornerRadius=14;txt(n,'The Event stays Live.',17,'accent','Bold');txt(n,'Complete Event is a separate action.',14,'ink');
},[['Keep run open','secondary'],['Finish Booth Mode','primary']],'D08 — Irreversible run finish request. Finishing cannot be reversed by Resume or access replacement.');

dialogue('D09 / Complete Event',11,'CircleCheck','Complete this Event?','Mia & Leo’s wedding will move to History.',m=>{
  facts(m,[['Booth runs','All Finished'],['Pending prints','0'],['Booked prints','60'],['Confirmed Prints','38']]);
  txt(m,'Booking details, Client contact, Event Media and activity will be retained as a read-only record.',15,'muted');
  notice(m,'This Event cannot be edited afterward','Make sure the event is over before completing it.','warning');
},[['Keep Live','secondary'],['Complete Event','primary']],'D09 — Available only when all runs are Finished and every attempt is terminal. History retains contact and media.','success');

dialogue('D10 / Complete Event blocked',12,'Clock','Finish the Booth run first','This Event cannot be completed yet.',m=>{
  notice(m,'Booth Mode is Finishing','1 pending print must reach a reliable outcome before the run can finish.','warning');
  txt(m,'The Event remains Live. Resolve the pending outcome, then return here once every run is Finished.',15,'muted');
},[['View pending print','primary']],'D10 — Completion cannot silently discard an unresolved attempt or bypass run finishing.','warning');

dialogue('D11 / Cancel Draft',13,'CalendarDays','Cancel this Draft?','Cancel “June’s birthday” without deleting its record.',m=>{
  txt(m,'The Event will move to History as Cancelled. Booking details, Client contact and any attached Event Media will be retained.',15,'muted');
  notice(m,'It will become read-only','Cancelled Events cannot be edited or deleted.','warning');
},[['Keep Draft','secondary'],['Cancel Event','danger']],'D11 — Cancellation retains records. Distinguish clearly from never-started Draft deletion.','danger');

dialogue('D12 / Delete Draft',14,'TriangleAlert','Delete this Draft?','This removes “June’s birthday” and its booking details.',m=>{
  txt(m,'This Draft has never started. Deletion completes only after private Event Media cleanup is verified.',15,'muted');
  notice(m,'Only an anonymous activity reference remains','If cleanup cannot be verified, deletion stays pending.','warning');
  txt(m,'To retain the booking in History, cancel the Event instead.',14,'muted');
},[['Keep Draft','secondary'],['Delete Draft','danger']],'D12 — Never-started Draft only; no active run/attempt. No deletion action exists for Completed or Cancelled Events.','danger');

dialogue('D13 / Draft deletion — cleanup pending',15,'Clock','Media cleanup pending','Deletion is not complete.',m=>{
  notice(m,'We cannot yet verify that every file is removed','Interrupted or late uploads and leftover files must be accounted for.','warning');
  txt(m,'The original deletion request is saved. Checking its status will not create another deletion request.',15,'muted');
  txt(m,'An empty media list does not establish cleanup. This state stays visible until supported cleanup proof is available.',14,'muted');
},[['Back to Events','secondary'],['Check status','primary']],'D13 — Persistent pending feedback, never a success toast. Uploads being disabled does not establish deletion success.','warning');

dialogue('D14 / Stale Draft conflict',16,'RefreshCw','This Draft changed','Another device saved a newer version while you were editing.',m=>{
  notice(m,'Your changes were not saved','We did not overwrite the newer Event details.','warning');
  txt(m,'Review the latest version, then enter any changes you still need.',15,'muted');
  facts(m,[['Event','June’s birthday'],['Last update','Just now']]);
},[['Keep reviewing','secondary'],['Load latest','primary']],'D14 — Explicit conflict. Do not silently merge stale booking/media changes or claim the old save succeeded.','warning');

dialogue('D15 / Password reset — incomplete, active session',17,'LockKeyhole','Password saved. Reset incomplete.','We could not confirm that all Admin sessions ended.',m=>{
  notice(m,'Some Admin sessions may still be active','Your recovery session is confirmed active. Choose another different password to retry the reset and session sign-out.','warning');
  field(m,'New password','••••••••••••');field(m,'Confirm new password','••••••••••••');
  txt(m,'Active Booth access is independent and stays unchanged.',14,'muted');
},[['Reset password','primary']],'D15 — Retry is allowed only after server confirmation that the recovery session remains active. Never infer revocation from client state.','warning');

dialogue('D16 / Password reset — new link required',18,'LockKeyhole','Request a new reset link','Your password was saved, but we could not confirm that all Admin sessions ended.',m=>{
  notice(m,'This recovery session cannot be used','Its active status could not be verified. Request a new link to complete password recovery.','warning');
  txt(m,'We have not reported a successful reset. Booth access stays unchanged.',15,'muted');
},[['Request a new link','primary']],'D16 — Revoked or unverifiable recovery session: no password retry through the old session; no claim that all sessions ended.','warning');

const feedback=referenceBoard('D17 / Feedback — progress, success, error and offline',19);
eyebrow(feedback,'FEEDBACK / PERSISTENCE MATCHES CONSEQUENCE');title(feedback,'Always say what happened.',38);
const feedbackCols=twoColumns(feedback,'Saved and loading','Errors and unavailable');
notice(feedbackCols[0],'Draft saved','Mia & Leo’s wedding is ready for setup.','success');
notice(feedbackCols[0],'1 Film Package added','10 booked prints added. Physical film is loaded separately.','success');
const p=card(feedbackCols[0],'Checking operation');const pr=row(p,'Progress',12);icon(pr,'LoaderCircle',24,'accent');txt(pr,'Checking the result…',17,'ink','Bold',inner(p)-36);txt(p,'The connection was interrupted after submission. We are checking the original request before trying again.',14,'muted');
notice(feedbackCols[0],'No activity yet','Event actions will appear here.','success');
notice(feedbackCols[1],'Could not load activity','Your Event has not changed. Try loading this section again.','danger');button(feedbackCols[1],'Retry loading','secondary');
notice(feedbackCols[1],'Connection unavailable','We could not reach the server. Your last result is not confirmed.','warning');
field(feedbackCols[1],'Original Film Packages','1.5',inner(feedbackCols[1]),'Enter a whole number of packages.');
notice(feedbackCols[1],'Media uploads are temporarily unavailable.','Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files.','warning');
rule(feedback);
txt(feedback,'Modal behavior',19,'ink','Bold');
txt(feedback,'Move focus into the dialog, keep Tab within it, and return focus to the triggering control after closing. Use Escape to dismiss only when dismissal is safe. Confirmation never fires from merely opening a dialog. Critical pending/error states remain available after transient feedback disappears.',15,'muted');
txt(feedback,'Mobile layout: the same 480 px maximum dialog becomes viewport width minus 32 px, with vertically stacked actions if labels cannot fit. Preserve a visible close/back action; scroll the dialog body on short viewports.',14,'muted');
caption(feedback,'D17 — Progress is factual: request in flight, checking receipt, or pending physical outcome. No fabricated percentage or timed success.');

return audit();
