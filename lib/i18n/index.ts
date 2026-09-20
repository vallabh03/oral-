import clinicalSources from "./clinical-sources.json";
import as from './locales/as.json';
import bn from './locales/bn.json';
import brx from './locales/brx.json';
import doi from './locales/doi.json';
import en from './locales/en.json';
import gu from './locales/gu.json';
import hi from './locales/hi.json';
import kn from './locales/kn.json';
import kok from './locales/kok.json';
import ks from './locales/ks.json';
import mai from './locales/mai.json';
import ml from './locales/ml.json';
import mni from './locales/mni.json';
import mr from './locales/mr.json';
import ne from './locales/ne.json';
import or from './locales/or.json';
import pa from './locales/pa.json';
import sa from './locales/sa.json';
import sat from './locales/sat.json';
import sd from './locales/sd.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import ur from './locales/ur.json';
import { isLocale, type Locale } from './languages';
type Reviewed = { text: string; reviewer: string; reviewedAt: string; source: string };
type Catalog = { messages: Record<string,string>; clinical: Record<string,Reviewed> };
export const catalogs: Record<Locale,Catalog> = {as,bn,brx,doi,en,gu,hi,kn,kok,ks,mai,ml,mni,mr,ne,or,pa,sa,sat,sd,ta,te,ur};
export function translate(locale: Locale, source: string, clinical = false): {text:string;lang:Locale} {
 if (!isLocale(locale) || locale === 'en') return {text:source,lang:'en'};
 const key = source.trim().replace(/\s+/g,' ');
 if (clinical || clinicalSources.includes(key)) {
   const entry = catalogs[locale].clinical[key];
   if (entry && entry.source === key && entry.reviewer && entry.reviewedAt && entry.text) return {text:entry.text,lang:locale};
   return {text:source,lang:'en'};
 }
 const text = catalogs[locale].messages[key];
 return text ? {text:source.replace(source.trim(),text),lang:locale} : {text:source,lang:'en'};
}
