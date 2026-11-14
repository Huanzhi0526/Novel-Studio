export function orderedChapters(volumes = [], docs = []) {
  const byVolume = new Map();
  for (const doc of docs ?? []) {
    if (!doc || doc.kind !== 'chapter' || doc.deleted) continue;
    let list = byVolume.get(doc.volume_id);
    if (!list) {
      list = [];
      byVolume.set(doc.volume_id, list);
    }
    list.push(doc);
  }
  return (volumes ?? []).flatMap(volume => byVolume.get(volume.id) ?? []);
}
