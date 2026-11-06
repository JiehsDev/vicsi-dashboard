import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {PathnameContext,SearchParamsContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import {AppShell} from "../../components/AppShell";
const classes=[
  {id:"archived",name:"Older class",section:"A",archivedAt:"2026-10-01"},
  {id:"a",name:"Forensic investigation",section:"B",archivedAt:null},
  {id:"ab",name:"Forensic investigation",section:"C",archivedAt:null},
];
function render(path:string,role:"instructor"|"student"|"admin"="instructor",items=classes) {
  return renderToStaticMarkup(<PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams()}><AppShell role={role} name="Professor" classes={items}><h1>Page</h1></AppShell></SearchParamsContext.Provider></PathnameContext.Provider>);
}
test("classes appear as direct roster links with section and archived labels",()=>{
  const html=render("/class-results");
  for(const id of ["a","ab","archived"])assert.ok(html.includes(`href="/classes/${id}"`));
  assert.match(html,/All classes/);assert.match(html,/Section B/);assert.match(html,/Section A · Archived/);
  assert.ok(html.indexOf('href="/classes/a"')<html.indexOf('href="/classes/archived"'));
  assert.match(html,/aria-expanded="true"/);assert.match(html,/aria-controls=/);
});
test("a class remains selected inside its student and session routes, without prefix collisions",()=>{
  const html=render("/classes/a/students/student-a/sessions/attempt");
  assert.match(html,/<a(?=[^>]*href="\/classes\/a")(?=[^>]*aria-current="page")[^>]*>/);
  assert.doesNotMatch(html,/<a(?=[^>]*href="\/classes\/ab")(?=[^>]*aria-current="page")[^>]*>/);
});
test("directory and empty states remain navigable without invented classes",()=>{
  const html=render("/classes","instructor",[]);
  assert.match(html,/<a(?=[^>]*href="\/classes")(?=[^>]*aria-current="page")[^>]*>/);
  assert.match(html,/No classes available/);assert.doesNotMatch(html,/href="\/classes\/a"/);
});
test("student navigation does not render the instructor class list",()=>{
  const html=render("/results/home","student");
  assert.doesNotMatch(html,/Course management|Older class|Section B/);
  assert.match(html,/My Sessions/);assert.match(html,/How to Play/);
});
test("student class joins highlight My Classes without highlighting My Sessions",()=>{
  const html=render("/results/classes/join","student");
  assert.match(html,/<a(?=[^>]*href="\/results\/classes")(?=[^>]*aria-current="page")[^>]*>/);
  assert.doesNotMatch(html,/<a(?=[^>]*href="\/results")(?=[^>]*aria-current="page")[^>]*>/);
});
test('administrator navigation contains only the foundation pages with one active destination',()=>{
 const html=render('/admin/activity','admin');
 assert.match(html,/System administration/);assert.match(html,/Administrator access/);assert.match(html,/Activity log/);
 assert.doesNotMatch(html,/Course management|My Sessions|Recent Sessions|href="\/classes\/a"/);
 assert.match(html,/<a(?=[^>]*href="\/admin\/activity")(?=[^>]*aria-current="page")[^>]*>/);
 assert.doesNotMatch(html,/<a(?=[^>]*href="\/admin")(?=[^>]*aria-current="page")[^>]*>/);
});
