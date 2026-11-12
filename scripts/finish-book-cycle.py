"""Finalize one completed receiver cycle; never poll or dispatch agents."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, subprocess, zipfile

parser = argparse.ArgumentParser()
parser.add_argument('audit')
parser.add_argument('--next-check', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
audit = (root / args.audit).resolve()
assert audit.is_relative_to(root / '.local')
report = json.loads((audit / 'import-report.json').read_text(encoding='utf8'))
index = json.loads((audit / 'index-report.json').read_text(encoding='utf8'))
reviews = json.loads((audit / 'format-review.json').read_text(encoding='utf8'))
queue_path = root / '拆书工作区/派工队列.json'
queue = json.loads(queue_path.read_text(encoding='utf8'))
assert report.get('originalAndBodiesUnchanged') and not report.get('error')
total = report['counts']['reference_cards']
assert index['cards'] == index['currentVectors'] == total and not index.get('error')
assert all(not b['errors'] for b in reviews)
done = [j for j in queue['jobs'] if j['state'] == 'completed']
remaining = [j for j in queue['jobs'] if j['state'] != 'completed']
running = [j for j in queue['jobs'] if j['state'] == 'running']
summary = '、'.join(f"{b['title']} {b['count']}卡" + ('（阶段入库，原任务继续）' if b.get('deliveryStage') == 'partial' else '') for b in reviews)
current = f"本队列已完成{len(done)}部{sum(j['volumes'] for j in done)}卷；剩余{len(remaining)}部{sum(j['volumes'] for j in remaining)}卷，当前已补派的三路为" + '、'.join(j['title'] for j in running) + '。'
rel_audit = audit.relative_to(root).as_posix()

def save(name, change):
    p = root / name
    backup = audit / 'docs-before' / name
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists(): shutil.copy2(p, backup)
    p.write_text(change(p.read_text(encoding='utf-8-sig')), encoding='utf8')

line = f"- 工作目录在 `拆书工作区`，跳过原已完成两书。{current}本轮{summary}已按格式标签简验通过并正式导入，现库{total}卡及当前修订语义向量全部就绪。回执 `{rel_audit}`。"
save('HANDOFF.md', lambda s: '\n'.join(
    line if l.startswith(('- 工作目录已迁入 `拆书工作区`', '- 工作目录在 `拆书工作区`'))
    else re.sub(r'、\d+ 张卡.*', f'、{total} 张卡；本轮{summary}。当前修订语义向量全部就绪；回执 `{rel_audit}`。原创、原文、封存状态及非本批卡片未变。', l)
    if l.startswith('- 正式库现为') else l for l in s.splitlines()) + '\n')
save('docs/maintenance.md', lambda s: re.sub(r'现已按用户授权导入[^\n]*?共 \d+ 张卡（格式标签简验', f'现已按用户授权导入拆书交付共 {total} 张卡（格式标签简验', s))
for name in ['docs/knowledge-library.md', 'docs/开发与运维接管提示词.md']:
    save(name, lambda s: re.sub(r'1,110,178 个正文块、\d+ 张卡', f'1,110,178 个正文块、{total} 张卡', s))

items = '\n'.join(f"- {b['title']}：{b['count']}卡／{b['volumes']}卷，package_id `{b['packageId']}`，SHA-256 `{b['sha256']}`。" + (' Agent自报阶段稿，仅阶段验收和入库，不计整书完工。' if b.get('deliveryStage') == 'partial' else '') for b in reviews)
fixes = '\n'.join(f"- 接收方交付修复（{b['title']}）：{b['finalization']}" for b in reviews if b.get('finalization'))
entry = f"""
## {audit.name} 定时简验与接续

本轮只验受限Markdown、分组检索标签、协议与同版导入安全，不复核内容、全文质量或标签语义。

{items}
{fixes}
- `node --disable-warning=ExperimentalWarning {rel_audit}/review.mjs`：全部卡片格式与标签通过、协议无警告，同版正文及结构资源一致；无内容深审。修复情况见上述逐包记录，原包和旧回执保留。
- `node --disable-warning=ExperimentalWarning {rel_audit}/import.mjs`：确认正式程序未运行，先一致备份和隔离演练，再正式导入。备份 `{report['backup']['filename']}`，SHA-256 `{report['backup']['sha256']}`。各包重导duplicate，正文版本新增0，SQLite完整性与外键通过；原创、正文、结构、资源、封存状态与非本批现卡证据摘要不变。详见 `import-report.json`。
- `python -B -X utf8 {rel_audit}/publish.py` 同步书目录验收状态、实际原文摘要及旁标记、共享原文目录、正式导入回执与队列；修改前副本在 `publish-before`。
- `node --disable-warning=ExperimentalWarning {rel_audit}/index.mjs`：新增本批向量，当前全部{total}卡向量就绪，见 `index-report.json`。并用 `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 补派空槽；{current}
- 派工工具使用ACP流式UTF-8解码，防止中文路径被分块损坏；读写路径限定本书工作区。`node --check scripts/book-agent-worker.mjs` 通过。工作台代码、依赖和协议不变，应用仍0.1.19。
- `python -B -X utf8 scripts/finish-book-cycle.py {rel_audit} --next-check {args.next_check}` 更新交接记录、重做源码ZIP并核对CRC、文档内容和SHA-256；安装器摘要不变。常态两小时heartbeat继续，本轮结束后不持续监督。

"""
save('docs/acceptance.md', lambda s: s.replace('# Novel Studio 验收记录\n', '# Novel Studio 验收记录\n' + entry, 1))
save('docs/book-dispatch.md', lambda s: s + f"\n## {audit.name}\n\n{summary}已简验并入库；现库{total}卡及向量就绪。{current}常态两小时定时继续，不持续监督。回执 `{rel_audit}`。\n")
queue.update(nextCheckAt=args.next_check, lastCycleReport=str(audit/'import-report.json'), lastIndexReport=str(audit/'index-report.json'))
queue_path.write_text(json.dumps(queue, ensure_ascii=False, indent=2), encoding='utf8')
subprocess.run(['npm.cmd', 'run', 'package:source'], cwd=root, check=True)
manifest = root/'release/NovelStudio-0.1.19-SHA256.txt'
lines = []
for l in manifest.read_text(encoding='utf8').splitlines():
    old, name = l.split('  ', 1)
    actual = hashlib.sha256((root/'release'/name).read_bytes()).hexdigest()
    if name != 'NovelStudio-0.1.19-source.zip': assert actual == old
    lines.append(f'{actual}  {name}')
with zipfile.ZipFile(root/'release/NovelStudio-0.1.19-source.zip') as z:
    assert z.testzip() is None
    for name in ['HANDOFF.md', 'docs/acceptance.md', 'docs/book-dispatch.md', 'scripts/book-agent-worker.mjs']:
        assert z.read(name) == (root/name).read_bytes()
    assert not any(n.startswith(('拆书工作区/', '.local/')) for n in z.namelist())
manifest.write_text('\n'.join(lines)+'\n', encoding='utf8')
print(f'已完成本轮收尾：{total}卡，剩余{len(remaining)}部；不继续轮询。')
