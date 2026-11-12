# NTS 与 NKS draft-0.1

这是首个可实现的内部协议草案。Schema 负责字段与类型，语义检查规则同等有效；Schema 通过不等于引用正确或内容可信。文件名 result.schema.json。样例位于 examples，均为自创测试文本。

## 结果包

ZIP 根目录有 result.json；assets 下是插图等静态资源；source 下可附原始 TXT／EPUB。所有声明文件用相对 POSIX 路径、SHA-256 和用途记录在 resources。只允许 TXT、EPUB、PNG、JPEG、WEBP 等明确需要的类型，不含执行脚本。正式工作台负责验证类型、解压大小及目录越界。

result.json 包含 schema_version、package_id、work、volumes、structures、cards、report、resources。schema_version 固定 draft-0.1；package_id 为本次产物 UUID。完全相同包摘要重复导入必须幂等；同 package_id 却不同内容必须报冲突。

## NTS 正文与哈希

一卷对象包含 volume_id、title、revision_id、normalized_payload。payload 的字段顺序严格为 volume_id、blocks。每个 block 字段顺序严格为 kind、text、asset_sha256、note_target；四字段均存在，没有值使用 null。kind 为 text、image 或 note。文本 NFC，内部换行 LF；文本段落不得空字符串。image 的 text 可为说明文字，asset_sha256 必须能在 resources 找到；note_target 如有值为同卷段落 ID，必须有效。

payload 不含 revision_id，也不含 paragraph_id。用紧凑 JSON 序列化，ensure_ascii=false，separators=(',',':')，UTF-8 无 BOM，计算 SHA-256 十六进制小写得到 revision_id。字段顺序是本草案的一部分，不使用任意 JSON 重序后的字节。调用方必须按上述顺序重建对象后再计算。

block 从 1 起按顺序派生 paragraph_id：'p'＋至少六位十进制数字，例 p000001。原文段落和段落 ID 一一对应；读取器通过数组顺序构造索引，不额外维护可能互相矛盾的 ID 列表。work_id、volume_id、revision_id、paragraph_id 共同确定引用位置。

同一卷的 payload 未变时沿用 revision_id 和段落 ID，补卷时保留已入库卷的版本。正文或图片变化时形成新 revision，已有证据仍绑定其原先引用的版本。原始文件的摘要记录在 resources 中，标准正文摘要按 payload 单独计算。

## 章节结构

结构节点包含 structure_id、volume_id、revision_id、parent_id、type、title、start、end。start 和 end 是闭区间段落 ID。type 为 volume、chapter、prologue、epilogue、interlude、afterword、scene、frontmatter 或 unclassified。unclassified 需要 report 疑点说明。

同级节点范围不交叉；子节点须在父范围内；scene 可在章内。volume 是容器，不代表所有段落已有具体归属：每个段落至少要归属于一个非 volume、非 scene 的结构节点；目录等使用 frontmatter，未知内容使用 unclassified 并报告。结构 title 保留原作文字，无标题为 null；界面标签不得回写成原作标题。

## NKS 卡片

work 为包级归属。card_id 在该作品内唯一且跨重跑保留。category 为九类枚举之一；title 和 content 非空；claim_type 为 fact 或 interpretation；evidence 至少一条。每条证据包含 volume_id、revision_id、start、end，必须指向本包或同作品已经入库的正文版本。建议随包提供所需正文，便于独立校验。

aliases 和 related_card_ids 默认为空数组。aliases 收录名字、称呼和译名以辅助检索，related_card_ids 关联同作品中有独立用途的卡。人物、事件和故事线各按自身对象汇总。卡片数量按实际材料、可证范围和查找用途确定。

`title` 为纯文本。`content` 仍为字符串，可含受限制的小标题、粗体、列表和短引文，检索标签按组写在其中。格式与标签标准见[九类制卡与验收](知识卡质检与返工.md)。配色由应用呈现，结果包不加入样式、颜色字段或新标签字段。纯文本卡片继续合法，应用渲染能力在交付回执中另行确认。

九类卡片的信息覆盖、论点与证据对应、跨卷汇总、逐卡复查和入库验收见 [知识卡质检与返工](知识卡质检与返工.md)。正文可用换行和 `[1]`、`[2]` 标出所用证据序号。质检记录与验收说明在 ZIP 外单独交付。

## 报告及独立校验

report.processed_ranges 使用与 evidence 同样的范围结构；未处理范围由正文范围减去声明范围得到。category_status 覆盖全部九类，每项为 extracted、absent、not_processed 或 uncertain。issues 是可读疑点清单。extracted 应有对应卡片，absent 表示已读范围中没有合适内容，而非断言全书不存在。

导入程序必须额外检查：UUID 身份映射、相同 package_id 内容冲突、哈希、派生 ID、范围顺序、父级存在与循环、兄弟边界、正文归属、资源引用、卡片证据、跨包依赖和重复 ID。Schema 不能表达的检查不能省略。

出现结构性错误时整批不入库；手改冲突进入差异确认；无合适分类不是错误。章节结构覆盖不要求每个段落产生知识卡。处理范围仅描述外部产物，不创建工作台拆书任务。
