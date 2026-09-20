// Download official Google Fonts static assets for self-hosting. Never sends user data.
import fs from 'node:fs/promises';
const families = ['Noto Sans Telugu','Noto Sans Devanagari','Noto Sans Tamil','Noto Sans Kannada','Noto Sans Malayalam','Noto Sans Bengali','Noto Sans Gujarati','Noto Sans Gurmukhi','Noto Sans Oriya','Noto Sans Arabic','Noto Sans Ol Chiki'];
await fs.mkdir('public/fonts',{recursive:true});
let output='/* Self-hosted Noto fonts. Copyright Google and contributors; SIL Open Font License 1.1. */\n';
for(const family of families){
 const res=await fetch('https://fonts.googleapis.com/css2?family='+family.replaceAll(' ','+')+':wght@400;600&display=swap',{headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}});
 if(!res.ok)throw Error(family+' '+res.status);
 let css=await res.text();
 for(const url of new Set([...css.matchAll(/url\((https[^)]+)\)/g)].map(m=>m[1]))){
  const name=family.toLowerCase().replaceAll(' ','-')+'-'+url.split('/').pop();
  const font=await fetch(url);if(!font.ok)throw Error(name);
  await fs.writeFile('public/fonts/'+name,new Uint8Array(await font.arrayBuffer()));
  css=css.replaceAll(url,'/fonts/'+name);
 }
 output+=css+'\n';
}
await fs.writeFile('public/fonts/indic.css',output);
console.log('Saved '+families.length+' font families for local serving');
