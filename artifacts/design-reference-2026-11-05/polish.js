const page=await figma.getNodeByIdAsync(PAGE_ID);await figma.setCurrentPageAsync(page);
const roots=page.children.filter(n=>n.type==='FRAME');
const mutated=[];
for(const f of roots){
 for(const n of f.findAllWithCriteria({types:['INSTANCE']})){
  if(n.name.startsWith('Action / ')){
   const p=n.fills[0];if(p&&p.type==='SOLID'){
    const c=p.color,accent=hex('accent'),white=hex('surface');
    if(Math.abs(c.r-accent.r)<.002&&Math.abs(c.g-accent.g)<.002)n.strokes=[paint('accentSoft')];
    if(Math.abs(c.r-white.r)<.002&&Math.abs(c.g-white.g)<.002)n.strokes=[paint('muted')];
   }mutated.push(n.id);
  }
  if(n.name.startsWith('Field / ')){
   n.findAllWithCriteria({types:['FRAME']}).filter(x=>Array.isArray(x.strokes)&&x.strokes.length>0).forEach(x=>{x.strokes=[paint('muted')];x.resize(x.width,48);mutated.push(x.id);});n.primaryAxisSizingMode='AUTO';mutated.push(n.id);
  }
 }
}
if(PAGE_ID==='0:1'){
 const dashboard=await figma.getNodeByIdAsync('4:179');dashboard.children.find(n=>n.name==='Main').itemSpacing=20;
 const mobile=roots.find(n=>n.name.startsWith('A22'));if(mobile){mobile.resize(390,1400);mutated.push(mobile.id);}
 for(const f of roots.filter(n=>/^A(16|17|18|19|20)/.test(n.name))){
  const header=f.findOne(n=>n.type==='FRAME'&&n.name==='Mobile header');if(header){const back=header.children.find(n=>n.name==='Icon / ArrowLeft');if(back){const hit=box(header,'Back to Events / 44px target',44,0,10);hit.resize(44,44);hit.primaryAxisSizingMode='FIXED';hit.appendChild(back);header.insertChild(0,hit);mutated.push(header.id,back.id);}}
 }
}
if(PAGE_ID==='3:3'){
 const cover=roots.find(n=>n.name.startsWith('00 /'));cover.name='00 / Instax Booth — new design reference';mutated.push(cover.id);
 const brand=cover.findOne(n=>n.type==='TEXT'&&n.characters==='Still & Co.');if(brand){brand.characters='Instax Booth';mutated.push(brand.id);}
 for(const f of roots.filter(n=>/^D(0[1-9]|1[0-6]) \//.test(n.name))){
  const under=f.children.find(n=>n.name==='Dimmed Live Event backdrop');if(under){under.name='Neutral application backdrop';for(const n of [...under.children])n.remove();eyebrow(under,'INSTAX BOOTH');rule(under);mutated.push(under.id);}
  const header=f.findOne(n=>n.type==='FRAME'&&n.name==='Dialog header');if(header){const space=header.children.find(n=>n.name==='Header spacer');if(space){space.resize(308,48);mutated.push(space.id);}const x=header.children.find(n=>n.name==='Icon / X');if(x){const hit=box(header,'Close dialog / 44px target',44,0,12);hit.resize(44,44);hit.primaryAxisSizingMode='FIXED';hit.appendChild(x);mutated.push(x.id);}}
  const dialog=f.children.find(n=>n.name.startsWith('Dialog /'));if(dialog){dialog.y=Math.max(48,(f.height-dialog.height)/2);mutated.push(dialog.id);}
 }
 const research=roots.find(n=>n.name.startsWith('02 /'));const snappic=research.findOne(n=>n.type==='TEXT'&&n.characters.startsWith('Reference principle: deliberate capture'));if(snappic){snappic.characters='Reference principle: separate attract-screen and capture/standby styling. Its extra features are not added here.';mutated.push(snappic.id);}
 const typography=page.findOne(n=>n.type==='TEXT'&&n.characters.startsWith('Admin 14–16'));if(typography){typography.characters='Admin 14–16 px body · 28–36 px page titles\nBooth 22–23 px instructions/actions · 34–45 px headings\nCountdown 116 px.';mutated.push(typography.id);}
}
const report=roots.map(s=>{const b=s.absoluteBoundingBox;return {id:s.id,name:s.name,width:s.width,height:s.height,overflow:s.findAll(n=>n.visible&&n.type==='TEXT').filter(n=>{const a=n.absoluteBoundingBox;return a.x<b.x-1||a.y<b.y-1||a.x+a.width>b.x+b.width+1||a.y+a.height>b.y+b.height+1;}).map(n=>({id:n.id,name:n.name})),overwide:s.findAll(n=>n.type==='FRAME'&&n.layoutMode==='HORIZONTAL'&&n.children.length>1).filter(n=>n.children.some(c=>c.layoutPositioning!=='ABSOLUTE'&&c.x+c.width>n.width+1)).map(n=>({id:n.id,name:n.name}))};});
return {createdNodeIds:created,mutatedNodeIds:mutated,screens:report};
