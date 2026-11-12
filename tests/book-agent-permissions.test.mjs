import {test} from 'node:test';import assert from 'node:assert/strict';
import {commandPathsInside,permitBookTool} from '../scripts/book-agent-permissions.mjs';
const cwd='D:\\Vibe Coding\\Novel Studio\\拆书工作区\\本地知识库拆书\\叹气的亡灵想隐退';
const run=command=>permitBookTool({toolCall:{name:'run_command',kind:'execute',rawInput:{CommandLine:command}}},cwd);
test('公开网页URL不会被误判为s盘路径',()=>{
 assert.equal(run(`python -c "import urllib.request; print(urllib.request.urlopen('https://zh.wikipedia.org/wiki/弱角友崎同學').status)"`),true);
 assert.equal(commandPathsInside("urls=['https://baike.baidu.com/item/弱角友崎同学','http://example.com']",cwd),true);
});
test('日志标签和转义换行不是盘符；同一命令真正的越界路径仍拒绝',()=>{
 assert.equal(run(String.raw`node -e "const fs=require('fs'); const cards=JSON.parse(fs.readFileSync('施工输出/工作/cards.json','utf8')); console.log('c9 content:\n',cards[0].content);"`),true);
 assert.equal(commandPathsInside(String.raw`console.log('content:\n'); fs.readFileSync('C:\\private\\x.json')`,cwd),false);
});
test('同书正常及Python双反斜杠路径不会误判越界',()=>{
 for(const path of [cwd+'\\施工输出\\工作\\pkg\\result.json',(cwd+'\\施工输出\\交付\\result-完整版-{ts}.zip').replaceAll('\\','\\\\')])assert.equal(commandPathsInside(`python -c "p='${path}'"`,cwd),true);
});
test('其他书、父目录和凭证路径仍不放行',()=>{
 for(const path of ['D:\\Vibe Coding\\Novel Studio\\library.sqlite',cwd+'外\\x.json','C:\\Users\\78828\\.gemini\\config.json',cwd+'\\..\\其他书\\x.json'])assert.equal(commandPathsInside(`python -c "p='${path}'"`,cwd),false);
 assert.equal(run('python ../其他书/run.py'),false);
});
test('只允许删除本书工作区内单个result测试ZIP',()=>{
 assert.equal(run(`Remove-Item -LiteralPath "${cwd}\\施工输出\\工作\\result-test.zip" -Force`),true);
 for(const command of [`Remove-Item -LiteralPath "${cwd}\\输入\\原文.zip" -Force`,`Remove-Item -Path "${cwd}\\施工输出\\工作\\result-test.zip" -Force -Recurse`,`Remove-Item -Path "${cwd}\\施工输出\\工作\\result-*.zip" -Force`,`rm -rf "${cwd}"`])assert.equal(run(command),false);
});
test('同书读取、打包、校验放行；其他目录读取与派生代理拒绝',()=>{
 assert.equal(run(`python "${cwd}\\工具\\pack-result.py" "${cwd}\\施工输出\\工作\\pkg" --out "${cwd}\\施工输出\\工作\\result-new.zip"`),true);
 assert.equal(permitBookTool({toolCall:{name:'read_file',kind:'read',rawInput:{AbsolutePath:cwd+'\\进度.json'}}},cwd),true);
 assert.equal(permitBookTool({toolCall:{name:'read_file',kind:'read',rawInput:{AbsolutePath:'C:\\Users\\78828\\.gemini\\config.json'}}},cwd),false);
 assert.equal(permitBookTool({toolCall:{name:'delegate_agent',kind:'execute',rawInput:{}}},cwd),false);
});
