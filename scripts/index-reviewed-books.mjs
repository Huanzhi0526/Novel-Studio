import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store} from '../app/main/store.mjs';
import {ReferenceService} from '../app/main/reference.mjs';
import {EmbeddingProvider} from '../app/main/embedding.mjs';
assert.ok(process.argv[2],'指定审计目录');
const audit=resolve(process.argv[2]);
const report=JSON.parse(await readFile(join(audit,'import-report.json'),'utf8'));
assert.ok(report.originalAndBodiesUnchanged&&!report.error);
// Use the production vector template and index implementation for offline
// maintenance, including archived cards, without changing archive state.
let source=await readFile(new URL('../app/main/search.mjs',import.meta.url),'utf8');
assert.equal(source.split('w.deleted IS NULL AND').length-1,1);
source=source.replace('w.deleted IS NULL AND','1=1 AND')
 .replace("'./store.mjs'",JSON.stringify(new URL('../app/main/store.mjs',import.meta.url).href))
 .replace("'./search-text.mjs'",JSON.stringify(new URL('../app/main/search-text.mjs',import.meta.url).href));
const {SearchService}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const data='C:/Users/78828/AppData/Local/Novel Studio';
const cfg=JSON.parse(await readFile(join(data,'embedding.json'),'utf8'));
const store=new Store(join(data,'library.sqlite'));
const embedding=new EmbeddingProvider(Object.fromEntries(['modelPath','runtimePath','pythonPath','id'].filter(k=>cfg[k]).map(k=>[k,cfg[k]])));
const search=new SearchService(new ReferenceService(store),embedding),out={};
try{
 out.prepared=await search.prepare({workIds:report.formal.map(b=>b.workId)});
 out.cards=store.db.prepare('SELECT count(*) n FROM reference_cards').get().n;
 out.currentVectors=store.db.prepare('SELECT count(*) n FROM reference_vectors v JOIN reference_cards c ON c.id=v.card_row WHERE v.card_revision=c.revision AND v.model_id=?').get(embedding.id).n;
 assert.equal(out.cards,out.currentVectors);
 assert.deepEqual(JSON.parse(JSON.stringify(store.db.prepare('SELECT work_id,deleted FROM reference_works ORDER BY work_id').all())),report.workState);
 out.archivedStateUnchanged=true;console.log(JSON.stringify(out));
}catch(e){out.error=String(e);throw e;}
finally{await embedding.close();store.close();await writeFile(join(audit,'index-report.json'),JSON.stringify(out,null,2));}
