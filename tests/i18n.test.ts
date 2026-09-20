import { test } from "node:test";
import assert from "node:assert/strict";
import { languages, isLocale, localeInfo } from "../lib/i18n/languages.ts";
import { catalogs, translate } from "../lib/i18n/index.ts";
import { registration, validateAnswers, pilot } from "../lib/domain.ts";
test("all 23 native language choices have central catalogues and safe fallback", () => {
  assert.equal(languages.length, 23);
  assert.equal(new Set(languages.map(l=>l.code)).size,23);
  for (const language of languages) {
    assert.ok(catalogs[language.code]);
    assert.equal(translate(language.code,"Unknown source message").text,"Unknown source message");
    assert.ok(translate(language.code,"Save").text);
  }
  assert.equal(isLocale("__proto__"),false);
  assert.equal(isLocale("hi-IN"),false);
});
test("clinical text requires an exact source and medical reviewer metadata", () => {
  const source = "Do you currently use tobacco?";
  catalogs.te.messages[source] = "unreviewed";
  assert.equal(translate("te",source,true).text,source);
  catalogs.te.clinical[source] = {text:"TEST REVIEWED STRING",source,reviewer:"test-only reviewer",reviewedAt:"2026-09-19"};
  assert.equal(translate("te",source,true).text,"TEST REVIEWED STRING");
  catalogs.te.clinical[source].source="obsolete wording";
  assert.equal(translate("te",source,true).text,source);
  delete catalogs.te.messages[source]; delete catalogs.te.clinical[source];
});
test("source clinical labels cannot use the unreviewed UI dictionary", () => {
  const source=pilot.questions[0].text;
  catalogs.hi.messages[source]="not approved";
  assert.equal(translate("hi",source).text,source);
  delete catalogs.hi.messages[source];
});
test("RTL scripts and fallback language metadata remain explicit", () => {
  for(const code of ["ur","ks","sd"] as const)assert.equal(localeInfo(code).dir,"rtl");
  assert.equal(localeInfo("te").dir,"ltr");
  assert.equal(translate("ur","Unknown source message").lang,"en");
  assert.equal(translate("te","Save").lang,"te");
});
test("language does not change canonical questionnaire answers", () => {
  const answers={habits:["None"],duration:"Not applicable",frequency:"Not applicable",symptoms:["None"],awareness:true,warning_awareness:true,previous_screening:"No"};
  const before=JSON.stringify(answers);
  languages.forEach(l=>Object.values(answers).forEach(v=>translate(l.code,String(v),true)));
  assert.equal(JSON.stringify(answers),before);
  assert.ok(validateAnswers(pilot,answers));
  assert.equal(registration.safeParse({preferredLanguage:"xx"}).success,false);
});
