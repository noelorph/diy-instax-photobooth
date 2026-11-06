// Figma-only drawing source for this proposal; no application runtime changes.
const C = {paper:'#F7F4EE',surface:'#FFFFFF',ink:'#252A27',muted:'#62675F',accent:'#AD402B',accentSoft:'#F9E4DC',line:'#D8DBD2',success:'#28614B',successSoft:'#E6F0E8',warning:'#805519',warningSoft:'#F5ECD9',danger:'#AE3434',dangerSoft:'#F9E7E3',night:'#202722'};
const created = [], screens = [];
const track = n => { created.push(n.id); return n; };
await Promise.all(['Regular','Medium','SemiBold','Bold','ExtraBold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
await Promise.all(['Regular','Italic'].map(style=>figma.loadFontAsync({family:'Libre Baskerville',style})));
await figma.loadFontAsync({family:'Inter',style:'Regular'});
const localVars = await figma.variables.getLocalVariablesAsync('COLOR');
const vars = Object.fromEntries(localVars.map(v=>[v.name,v]));
const hex = c => { const h=(C[c]||c).replace('#',''); return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255}; };
function paint(c){const p={type:'SOLID',color:hex(c)};return vars[c]?figma.variables.setBoundVariableForPaint(p,'color',vars[c]):p;}
function fill(n,c){n.fills=c?[paint(c)]:[];return n;}
const buttonSet = await figma.importComponentSetByKeyAsync('cc8b558dc7d9684011b6b99ce8e6509399bc836b');
const inputSet = await figma.importComponentSetByKeyAsync('c28150b04d333d34ed9d2b77abd9f2f54e1a878a');
const baseButton=buttonSet.children.find(n=>n.type==='COMPONENT'&&n.name==='Variant=Primary, State=Default, Size=Medium');
const baseInput=inputSet.children.find(n=>n.type==='COMPONENT'&&n.name==='State=Default, Value Type=Default');
function inner(p){return p.width-(p.paddingLeft||0)-(p.paddingRight||0);}
function box(parent,name,w,gap=16,padding=0,bg=null,direction='VERTICAL'){
 const n=track(figma.createAutoLayout(direction));n.name=name;n.resize(w,1);n.primaryAxisSizingMode=direction==='VERTICAL'?'AUTO':'FIXED';n.counterAxisSizingMode=direction==='VERTICAL'?'FIXED':'AUTO';n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=padding;fill(n,bg);n.clipsContent=false;if(parent)parent.appendChild(n);return n;
}
function row(p,name='Row',gap=16,w=inner(p)){return box(p,name,w,gap,0,null,'HORIZONTAL');}
function card(p,name,w=inner(p),bg='surface',padding=24){const n=box(p,name,w,16,padding,bg);n.cornerRadius=20;n.strokes=[paint('line')];n.strokeWeight=1;return n;}
function txt(p,chars,size=16,color='ink',style='Regular',w=inner(p),font='Manrope'){
 const n=track(figma.createText());n.fontName={family:font,style};n.fontSize=size;n.lineHeight={unit:'PERCENT',value:size>=28?112:145};n.characters=chars;fill(n,color);n.resize(Math.max(1,w),1);n.textAutoResize='HEIGHT';p.appendChild(n);n.name=chars.slice(0,60);return n;
}
function title(p,chars,size=36,w=inner(p)){return txt(p,chars,size,'ink','SemiBold',w);}
function eyebrow(p,chars,w=inner(p),color='muted'){const n=txt(p,chars.toUpperCase(),12,color,'Bold',w);n.letterSpacing={unit:'PERCENT',value:12};return n;}
function spacer(p,h){const n=track(figma.createFrame());n.resize(1,h);fill(n,null);p.appendChild(n);return n;}
function rule(p,w=inner(p)){const n=track(figma.createRectangle());n.resize(w,1);fill(n,'line');p.appendChild(n);return n;}
function button(p,label,kind='primary',w=inner(p),h=48){
 const n=track(baseButton.createInstance());p.appendChild(n);n.name='Action / '+label;
 n.setProperties({'Label#2:0':label,'Has Icon Start#4:128':false,'Has Icon End#4:64':false});
 n.resize(w,h);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='FIXED';n.primaryAxisAlignItems='CENTER';n.counterAxisAlignItems='CENTER';n.cornerRadius=12;n.paddingLeft=n.paddingRight=16;
 const bg=kind==='primary'?'accent':kind==='dark'?'ink':kind==='danger'?'danger':kind==='disabled'?'line':kind==='soft'?'accentSoft':'surface';
 fill(n,bg);n.strokes=kind==='secondary'?[paint('muted')]:kind==='primary'?[paint('accentSoft')]:[];
 n.findAllWithCriteria({types:['TEXT']}).forEach(t=>{t.fontName={family:'Manrope',style:'Bold'};t.fontSize=h>=60?22:15;fill(t,['primary','dark','danger'].includes(kind)?'surface':kind==='disabled'?'muted':'ink');});
 return n;
}
function field(p,label,value,w=inner(p),error=null){
 const n=track(baseInput.createInstance());p.appendChild(n);n.name='Field / '+label;
 n.setProperties({'Label#280:41':label,'Value#630:14':value,'Has Label#57:0':true,'Has Error#72:6':!!error,'Error#280:44':error||'','Has Description#611:20':false});
 n.resize(w,n.height);n.layoutSizingHorizontal='FIXED';
 n.findAllWithCriteria({types:['TEXT']}).forEach(t=>{t.fontName={family:'Manrope',style:t.name==='Label'?'SemiBold':'Regular'};t.fontSize=15;fill(t,t.name==='Error'?'danger':'ink');});
 n.findAllWithCriteria({types:['FRAME']}).filter(f=>Array.isArray(f.strokes)&&f.strokes.length>0).forEach(f=>{f.strokes=[paint(error?'danger':'muted')];f.resize(f.width,48);});
 n.primaryAxisSizingMode='AUTO';
 return n;
}
function badge(p,label,tone='success',w){const n=box(p,'Status / '+label,w||Math.max(74,label.length*7.2+24),0,0,tone+'Soft');n.paddingLeft=n.paddingRight=12;n.paddingTop=n.paddingBottom=7;n.cornerRadius=24;txt(n,label,12,tone,'Bold');return n;}
function notice(p,heading,body,tone='warning',w=inner(p)){const n=box(p,'Feedback / '+heading,w,6,18,tone+'Soft');n.cornerRadius=14;txt(n,heading,16,tone,'Bold');if(body)txt(n,body,14,'ink');return n;}
function icon(p,name,size=24,color='ink'){
 const source=ICONS[name];if(!source)throw new Error('Unknown icon '+name);
 const n=track(figma.createNodeFromSvg(source.replaceAll('currentColor',C[color]||color)));n.name='Icon / '+name;n.resize(size,size);p.appendChild(n);return n;
}
function artboard(name,w=1440,h=1024,index=0,columns=3,gap=100,bg='paper'){
 const f=box(null,name,w,0,0,bg);f.resize(w,h);f.primaryAxisSizingMode='FIXED';f.x=100+(index%columns)*(w+gap);f.y=180+Math.floor(index/columns)*(h+150);f.clipsContent=true;screens.push(f);return f;
}
function caption(frame,text){const p=figma.currentPage;const n=txt(p,text,16,'muted','Regular',frame.width);n.x=frame.x;n.y=frame.y+frame.height+20;return n;}
function metric(p,label,value,note,w=inner(p),accent=false){const n=card(p,label,w,accent?'ink':'surface');eyebrow(n,label,inner(n),accent?'paper':'muted');txt(n,value,48,accent?'surface':'ink','SemiBold');txt(n,note,13,accent?'paper':'muted');return n;}
function facts(p,items){items.forEach(([a,b])=>{const r=row(p,a,12);txt(r,a,14,'muted','Regular',Math.floor(inner(p)*0.43));txt(r,b,14,'ink','SemiBold',Math.floor(inner(p)*0.57)-12);});}
function footer(p,label='Instax Booth · Admin'){spacer(p,8);rule(p);txt(p,label,12,'muted');}
function audit(){
 const all=screens.flatMap(s=>[s,...s.findAll(()=>true)]);
 const counts={};for(const n of all)counts[n.type]=(counts[n.type]||0)+1;
 const textNodes=all.filter(n=>n.type==='TEXT');const badFonts=textNodes.filter(n=>!['Manrope','Libre Baskerville'].includes(n.fontName.family)).map(n=>({id:n.id,font:n.fontName}));
 const images=all.filter(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(f=>f.type==='IMAGE')).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height}));
 if(badFonts.length)throw new Error('Unexpected fonts '+JSON.stringify(badFonts.slice(0,5)));
 return {createdNodeIds:[...new Set([...created,...all.map(n=>n.id)])],screens:screens.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),counts,imageNodes:images,fontFamilies:[...new Set(textNodes.map(n=>n.fontName.family))]};
}
