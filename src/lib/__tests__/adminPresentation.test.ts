import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditFilters,auditActionLabel,adminDate} from '../adminPresentation';
test('audit filters reject invalid dates and normalize unsafe pagination',()=>{
 assert.match(auditFilters({from:'2026-02-31'}).error!,/valid dates/);
 assert.match(auditFilters({from:'2026-11-06',to:'2026-11-01'}).error!,/end date/);
 assert.equal(auditFilters({page:'1.2',type:'injected'}).page,1);assert.equal(auditFilters({page:'-2'}).page,1);
 assert.deepEqual(auditFilters({type:'enrollment',from:'2026-11-01',to:'2026-11-06',page:'2'}),{type:'enrollment',from:'2026-11-01',to:'2026-11-06',page:2,error:undefined});
});
test('activity uses readable labels and Philippine timestamps without leaking unknown codes',()=>{
 assert.equal(auditActionLabel('admin.access.disabled'),'Administrator access suspended');assert.equal(auditActionLabel('secret_sql_error'),'System record updated');
 assert.match(adminDate('2026-11-06T00:00:00Z'),/8:00/);assert.equal(adminDate('invalid'),'Date unavailable');
});
