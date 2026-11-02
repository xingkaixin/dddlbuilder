import sharp from 'sharp';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'apps/web/src/assets/brand/logo.webp');
const publicDir = path.join(process.cwd(), 'apps/web/public');
const docsPublicDir = path.join(process.cwd(), 'apps/docs/public');

// 16/32 像素放不下整幅图，只保留鲸鱼的脸。
const faceCrop = { left: 300, top: 300, width: 954, height: 954 };

const icons = [
  { dir: publicDir, name: 'logo.png', size: 120, rounded: true },
  { dir: docsPublicDir, name: 'logo.png', size: 120, rounded: true },
  { dir: publicDir, name: 'favicon-16x16.png', size: 16, rounded: true, crop: faceCrop },
  { dir: publicDir, name: 'favicon-32x32.png', size: 32, rounded: true, crop: faceCrop },
  { dir: publicDir, name: 'favicon-192.png', size: 192 },
  { dir: publicDir, name: 'favicon-512.png', size: 512 },
  { dir: publicDir, name: 'apple-touch-icon.png', size: 180 },
];

function roundedMask(size: number) {
  const radius = Math.round(size * 0.2);

  return Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" /></svg>`,
  );
}

async function generateLogos() {
  try {
    for (const { dir, name, size, rounded, crop } of icons) {
      const image = sharp(sourcePath);

      if (crop) image.extract(crop);

      image.resize(size, size);

      if (rounded) image.composite([{ input: roundedMask(size), blend: 'dest-in' }]);

      await image
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(path.join(dir, name));

      console.log(`✅ 生成 ${path.relative(process.cwd(), path.join(dir, name))}`);
    }
  } catch (error) {
    console.error('❌ 生成 logo 时出错:', error);
    process.exit(1);
  }
}

void generateLogos();
