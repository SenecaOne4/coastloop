import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>{
  if(!v.startsWith('--')) return null;
  const k=v.slice(2), n=a[i+1];
  return [k,n && !n.startsWith('--') ? n : 'true'];
}).filter(Boolean));

const brand=args.brand||'CoastLoop';
const objective=args.objective||'Create a premium local TV advertisement';
const offer=args.offer||'Local advertising you can watch work';
const cta=args.cta||'Advertise with CoastLoop';
const model=args.model||'glm-4.7-flash:latest';
const root=path.resolve(args.out||path.join(os.homedir(),'Downloads','coastloop-creatives'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const job=path.join(root,`${stamp}-${brand.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`);
const renders=path.join(job,'renders');
fs.mkdirSync(renders,{recursive:true});

const fallback={
  headline:'LOCAL ADS. REAL PROOF.',
  subhead:'Beautiful creative on screens inside nearby businesses.',
  cta:'ADVERTISE WITH COASTLOOP',
  image_prompt:'Cinematic premium coastal business district at blue hour, elegant restaurant and boutique interiors suggested through warm glass reflections, a tasteful modern wall-mounted television glowing naturally in the environment, deep charcoal, wine red, muted gold and warm cream palette, sophisticated commercial photography, high contrast, spacious composition with clean dark area on the left for typography, no readable text, no logos, no interface',
  negative_prompt:'words, letters, typography, logos, watermarks, posters, signs, distorted television, duplicated objects, clutter, low resolution, cartoon, oversaturated'
};

let brief=fallback;

if(args['skip-llm']==='true'){
  console.log('STAGE=LLM_SKIPPED');
}else try{
  const prompt=`You are the senior creative director for a premium hyperlocal TV advertising network.

Brand: ${brand}
Objective: ${objective}
Offer/positioning: ${offer}
Requested CTA: ${cta}

Design a single 16:9 television advertisement. The final typography will be composited separately, so the generated background MUST contain no text, letters, logos, signs, UI, or watermarks.

Return ONLY strict JSON with exactly:
{
 "headline":"maximum 7 words",
 "subhead":"maximum 16 words",
 "cta":"maximum 4 words",
 "image_prompt":"maximum 110 words, cinematic photographic art direction, reserve dark negative space on left for copy",
 "negative_prompt":"comma separated exclusions"
}

Tone: premium, confident, local, modern, visually expensive. Avoid generic AI language and advertising cliches.`;

  const raw=execFileSync('ollama',['run',model,prompt],{
    encoding:'utf8',
    timeout:120000,
    maxBuffer:1024*1024
  }).trim();

  const match=raw.match(/\{[\s\S]*\}/);
  if(match){
    const parsed=JSON.parse(match[0]);
    brief={
      headline:String(parsed.headline||fallback.headline).trim(),
      subhead:String(parsed.subhead||fallback.subhead).trim(),
      cta:String(parsed.cta||fallback.cta).trim().toUpperCase(),
      image_prompt:String(parsed.image_prompt||fallback.image_prompt).trim(),
      negative_prompt:String(parsed.negative_prompt||fallback.negative_prompt).trim()
    };
  }
}catch(e){
  console.log('LLM_FALLBACK=YES');
}

if(args.headline) brief.headline=String(args.headline).trim();
if(args.subhead) brief.subhead=String(args.subhead).trim();
if(args.cta) brief.cta=String(args.cta).trim().toUpperCase();
if(args['image-prompt']) brief.image_prompt=String(args['image-prompt']).trim();
if(args.negative) brief.negative_prompt=String(args.negative).trim();

fs.writeFileSync(path.join(job,'brief.json'),JSON.stringify({
  brand,objective,offer,model,...brief
},null,2));

console.log('STAGE=LOCAL_IMAGE_RENDER');

execFileSync(path.join(os.homedir(),'.local','bin','localgen'),[
  brief.image_prompt,
  '--w','1024',
  '--h','576',
  '--steps','9',
  '--negative',brief.negative_prompt,
  '--render-root',renders,
  '--out','background'
],{
  encoding:'utf8',
  timeout:900000,
  maxBuffer:1024*1024
});

const images=[];
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    const f=path.join(dir,name);
    const st=fs.statSync(f);
    if(st.isDirectory()) walk(f);
    else if(/\.(png|jpe?g|webp)$/i.test(name)) images.push(f);
  }
}
walk(renders);
if(!images.length) throw new Error('localgen produced no image');

images.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
const bg=images[0];
const final=path.join(job,'coastloop-tv-ad.png');

const esc=s=>String(s).replace(/[&<>"]/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
}[c]));

function lines(text,max=20){
  const words=String(text).trim().split(/\s+/);
  const out=[]; let line='';
  for(const word of words){
    const next=(line+' '+word).trim();
    if(line && next.length>max){out.push(line);line=word;}
    else line=next;
  }
  if(line) out.push(line);
  return out.slice(0,3);
}

const head=lines(brief.headline.toUpperCase(),18);
const headSvg=head.map((l,i)=>
  `<text x="112" y="${330+i*112}" class="headline">${esc(l)}</text>`
).join('');

const subY=330+head.length*112+38;

const overlay=`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#171412" stop-opacity=".97"/>
    <stop offset=".49" stop-color="#171412" stop-opacity=".78"/>
    <stop offset=".75" stop-color="#171412" stop-opacity=".17"/>
    <stop offset="1" stop-color="#171412" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
    <stop offset=".6" stop-color="#171412" stop-opacity="0"/>
    <stop offset="1" stop-color="#171412" stop-opacity=".58"/>
  </linearGradient>
  <style>
    .brand{font-family:Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:8px;fill:#d8c39a}
    .headline{font-family:Helvetica,Arial,sans-serif;font-size:94px;font-weight:800;letter-spacing:-3px;fill:#faf7f1}
    .sub{font-family:Helvetica,Arial,sans-serif;font-size:32px;font-weight:400;fill:#d8d0c8}
    .cta{font-family:Helvetica,Arial,sans-serif;font-size:25px;font-weight:800;letter-spacing:2px;fill:#faf7f1}
    .rail{font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:5px;fill:#d8c39a}
  </style>
</defs>
<rect width="1920" height="1080" fill="url(#shade)"/>
<rect width="1920" height="1080" fill="url(#bottom)"/>
<circle cx="122" cy="118" r="9" fill="#b8924a"/>
<text x="148" y="128" class="brand">${esc(brand.toUpperCase())}</text>
${headSvg}
<text x="116" y="${subY}" class="sub">${esc(brief.subhead)}</text>
<rect x="112" y="${subY+68}" rx="34" width="430" height="70" fill="#7b243c"/>
<text x="147" y="${subY+113}" class="cta">${esc(brief.cta)}</text>
<text x="112" y="995" class="rail">LOCAL  /  BEAUTIFUL  /  VERIFIED</text>
</svg>`;

console.log('STAGE=COMPOSITE');

await sharp(bg)
  .resize(1920,1080,{fit:'cover',position:'centre'})
  .composite([{input:Buffer.from(overlay)}])
  .png({compressionLevel:8})
  .toFile(final);

fs.writeFileSync(path.join(job,'manifest.json'),JSON.stringify({
  generated_at:new Date().toISOString(),
  local_only:true,
  llm:model,
  image_generator:'localgen / Z-Image-Turbo',
  source_background:bg,
  final,
  width:1920,
  height:1080,
  brief
},null,2));

console.log(`FINAL=${final}`);
console.log('LOCAL_CREATIVE=PASS');

if(args.open==='true'){
  try{execFileSync('open',[final]);}catch{}
}
