import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This fixture exercises the upstream EPUB renderer without making a site request.
const upstream = resolve('.local/downloader/fixture-cli/node_modules/wenku8/dist/epub/builder.js');
const { EpubBuilder } = await import(pathToFileURL(upstream));
const root = resolve('.local/acceptance/wenku8-builder');
const workspace = join(root, 'workspace');
await mkdir(join(workspace, 'assets'), { recursive: true });
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z2kAAAAASUVORK5CYII=', 'base64');
await writeFile(join(workspace, 'assets', 'lamp.png'), image);
const picture = { id: 'lamp', relativePath: 'assets/lamp.png', mediaType: 'image/png', extension: '.png' };
const book = {
  title: '生成器回归样书', author: '测试作者', language: 'zh-CN', description: '本地生成的机制样例',
  assets: [picture], coverAssetId: picture.id,
  volumes: Array.from({ length: 3 }, (_, index) => ({
    title: ['第一卷 海岸', '第二卷 旅途', '第三卷 归来'][index],
    chapters: [{
      id: `c${index + 1}a`, title: '序章', blocks: [
        { type: 'paragraph', text: `这是第 ${index + 1} 卷的序章。` },
        { type: 'image', assetId: picture.id, sourceUrl: 'https://example.invalid/fixture.png', alt: '本地测试灯塔' },
        { type: 'note', text: '上游注释段没有锚点。' }
      ]
    }, {
      id: `c${index + 1}b`, title: '后记', blocks: [{ type: 'paragraph', text: `第 ${index + 1} 卷完。` }]
    }]
  }))
};
const builder = new EpubBuilder();
await builder.build({ ...book, volumes: book.volumes.slice(0, 2) }, workspace, join(root, 'two.epub'));
await builder.build(book, workspace, join(root, 'three.epub'));
console.log(root);
