// Two mobile dialog examples; concatenate after figma-icons.js and figma-helpers.js.
const mobileDialogPage=await figma.getNodeByIdAsync('3:3');
await figma.setCurrentPageAsync(mobileDialogPage);
function mobileDialog(name,index,symbol,heading,subheading,render,actions,note){
  const f=artboard(name,390,844,0,1);f.x=4100+index*490;f.y=180;
  const under=box(f,'Neutral application backdrop',390,20,24,'paper');under.resize(390,844);under.primaryAxisSizingMode='FIXED';eyebrow(under,'INSTAX BOOTH');rule(under);
  const dim=track(figma.createRectangle());f.appendChild(dim);dim.name='Modal backdrop';dim.resize(390,844);fill(dim,'ink');dim.opacity=.38;dim.layoutPositioning='ABSOLUTE';dim.x=0;dim.y=0;
  const m=card(f,'Mobile dialog / '+heading,358,'surface',20);m.layoutPositioning='ABSOLUTE';m.cornerRadius=20;m.strokes=[];m.itemSpacing=12;
  const head=row(m,'Dialog header',12);
  const emblem=box(head,'State icon',40,0,8,'accentSoft');emblem.resize(40,40);emblem.primaryAxisSizingMode='FIXED';emblem.cornerRadius=12;icon(emblem,symbol,24,'accent');
  const space=box(head,'Header spacer',210,0);space.resize(210,44);space.primaryAxisSizingMode='FIXED';
  const close=box(head,'Close dialog / 44 px target',44,0,12);close.resize(44,44);close.primaryAxisSizingMode='FIXED';icon(close,'X',20,'muted');
  title(m,heading,26);txt(m,subheading,14,'muted');render(m);rule(m);
  actions.forEach(([label,kind])=>button(m,label,kind,318,48));
  m.x=16;m.y=Math.max(16,(844-m.height)/2);
  if(m.height>812)throw new Error(name+' exceeds mobile dialog height: '+m.height);
  caption(f,note);return f;
}
mobileDialog('D18 / Add Film Packages — phone 390 × 844',0,'PackagePlus','Add Film Packages','Mia & Leo’s wedding',m=>{
  field(m,'Additional Film Packages','1');
  const sum=box(m,'Capacity change',318,6,14,'accentSoft');sum.cornerRadius=12;txt(sum,'+10 booked prints',22,'accent','Bold');txt(sum,'Booked total: 60 → 70',14,'ink');
  field(m,'Client-request note · required','Mia requested an extra package.');
  txt(m,'This addition is permanent. Load physical film separately.',14,'muted');
},[['Add 1 package','primary'],['Cancel','secondary']],'D18 — 390 × 844 phone. 358 px dialog; stacked 48 px actions; close target 44 px. Addition changes capacity, not printer readiness.');
mobileDialog('D19 / Not printed — phone 390 × 844',1,'TriangleAlert','Record Not printed?','Only continue when the old job cannot eject later.',m=>{
  const choices=row(m,'Outcome selection',12);button(choices,'Printed','secondary',153,48);button(choices,'Not printed','soft',153,48);
  field(m,'Reason · required','No sheet ejected.');
  const check=row(m,'Safe-clear confirmation',10);const square=box(check,'Unchecked checkbox',24,0);square.resize(24,24);square.primaryAxisSizingMode='FIXED';square.cornerRadius=5;square.strokes=[paint('muted')];
  txt(check,'I established the old job is finished or cleared and cannot eject later.',14,'ink','Medium',284);
  notice(m,'Unsure? Keep it pending.','A reload alone does not settle this print. The booth stays unavailable.','warning');
},[['Confirm Not printed','disabled'],['Keep pending','secondary']],'D19 — Reason and safe-clear assurance required; no automatic resend. Unchecked state keeps Confirm disabled and the hold intact.');
return audit();
