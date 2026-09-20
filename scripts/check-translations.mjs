import fs from 'node:fs';
import ts from 'typescript';
const sources=['app/campaign/page.tsx','app/register/page.tsx','app/workspace/login.tsx','app/workspace.tsx','app/intake.tsx','app/care-ui.tsx','app/patient-profile.tsx','app/role-panels.tsx','app/language.tsx'];
const en=JSON.parse(fs.readFileSync('lib/i18n/locales/en.json','utf8'));
for(const file of sources){
 const source=fs.readFileSync(file,'utf8'), ast=ts.createSourceFile(file,source,99,true,4);
 function visit(n){
  if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='text'&&n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression&&ts.isStringLiteral(n.initializer.expression)){
   const key=n.initializer.expression.text.trim().replace(/\s+/g,' ');en.messages[key]=key;
  }
  if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='T')for(const c of n.children)if(ts.isJsxText(c)&&c.text.trim()){const key=c.text.trim().replace(/\s+/g,' ');en.messages[key]=key;}
  ts.forEachChild(n,visit);
 }
 visit(ast);
}
const files=fs.readdirSync('lib/i18n/locales').filter(x=>x.endsWith('.json'));
const coverage=[];
for(const file of files){
 const c=JSON.parse(fs.readFileSync('lib/i18n/locales/'+file,'utf8'));
 for(const [k,v] of Object.entries(c.messages)){if(typeof v!=='string'||!v.trim())throw Error(file+' invalid '+k);en.messages[k]??=k;}
 for(const [k,v] of Object.entries(c.clinical)){if(!v.text||v.source!==k||!v.reviewer||!Number.isFinite(Date.parse(v.reviewedAt)))throw Error(file+' invalid clinical review '+k);}
 coverage.push({language:file.slice(0,-5),interfaceEntries:Object.keys(c.messages).length,reviewedClinicalEntries:Object.keys(c.clinical).length});
}
if(process.argv.includes('--update-source'))fs.writeFileSync('lib/i18n/locales/en.json',JSON.stringify(en,null,2)+'\n');
fs.mkdirSync('outputs',{recursive:true});
fs.writeFileSync('outputs/translation-coverage.json',JSON.stringify({note:'Entries are not a claim of complete translation. Missing interface text and unreviewed clinical content fall back to the English source.',languages:coverage},null,2));
console.log('Validated '+files.length+' language catalogues. No clinical translations are claimed without review metadata.');
