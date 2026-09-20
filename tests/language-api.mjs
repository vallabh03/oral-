import assert from 'node:assert/strict';
const base='http://localhost:5173';
let checks=0;
function check(actual,expected,message){assert.equal(actual,expected,message);checks++;}
check((await fetch(base+'/api/preferences')).status,401,'anonymous preferences denied');
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.get('set-cookie').split(';')[0];
const headers={'Content-Type':'application/json',Origin:base,Cookie:cookie,'x-care-mode':'demo'};
const previous=await(await fetch(base+'/api/preferences',{headers})).json();
const put=(body,extra={})=>fetch(base+'/api/preferences',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify(body)});
try {
 for(const locale of ['te','hi','ur','sat','en']){
   check((await put({locale})).status,200,'valid locale saved');
   check((await(await fetch(base+'/api/preferences',{headers})).json()).locale,locale,'profile survives separate request');
 }
 check((await put({locale:'__proto__'})).status,400,'invalid locale rejected');
 check((await put({locale:'hi',userId:'another-user'})).status,400,'cannot edit another profile');
 check((await put({locale:'hi'},{Origin:'https://invalid.example'})).status,403,'cross-origin rejected');
 const dashboard=await(await fetch(base+'/api/care',{headers})).json();
 const data={name:'Demo Language API '+Date.now(),phone:'',age:35,campId:dashboard.camps[0].id,driverType:'Auto',workingArea:'Demo stand',recruitment:'Stand',contactIntended:false,registrationConsent:true,screeningConsent:true,preferredLanguage:'te'};
 const res=await fetch(base+'/api/care',{method:'POST',headers,body:JSON.stringify({action:'register',data})});
 check(res.status,200,'register with canonical locale');
 const patient=await res.json();
 const detail=await(await fetch(base+'/api/care?patient='+patient.id,{headers})).json();
 check(detail.patient.preferred_language,'te','patient preference stored');
 check(detail.patient.driver_type,'Auto','canonical enum remains unchanged');
 const report=await fetch(base+'/api/patient-report?patient='+patient.id+'&format=html&lang=ur',{headers});
 check(report.status,200,'authorized localized report');
 const html=await report.text();
 check(html.includes('lang="ur" dir="rtl"'),true,'report RTL');
 check(html.includes('name="lang"'),true,'report language selector');
 check((await fetch(base+'/api/patient-report?patient='+patient.id+'&lang=xx',{headers})).status,400,'invalid report locale rejected');
 check((await fetch(base+'/api/patient-report?patient='+patient.id+'&lang=hi')).status,401,'translation does not bypass report authentication');
} finally { await put({locale:previous.locale || 'en'}); }
console.log(checks+' language/API checks passed');
