import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// SVG 文件路径
const svgPath = path.join(process.cwd(), 'public/logo.svg');

// 需要生成的尺寸
const sizes = [
  { name: 'logo.png', size: 120 },
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192.png', size: 192 },
  { name: 'favicon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function generateLogos() {
  try {
    // 确保读取 SVG 文件
    const svgBuffer = fs.readFileSync(svgPath);

    // 为每个尺寸生成 PNG
    for (const { name, size } of sizes) {
      await sharp(svgBuffer)
        .resize(size, size)
        .png({
          quality: 100,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toFile(path.join(process.cwd(), 'public', name));

      console.log(`✅ 生成 ${name} (${size}x${size})`);
    }

    console.log('🎉 所有 logo 文件生成完成！');
  } catch (error) {
    console.error('❌ 生成 logo 时出错:', error);
    process.exit(1);
  }
}

generateLogos();
