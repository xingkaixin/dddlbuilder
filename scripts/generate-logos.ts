import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// SVG 文件路径
const svgPath = path.join(process.cwd(), 'public/logo.svg');
const publicDir = path.join(process.cwd(), 'public');

// 需要生成的尺寸
const sizes = [
  { name: 'logo.png', size: 120 },
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192.png', size: 192 },
  { name: 'favicon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

const ogImage = {
  name: 'og-image.png',
  width: 1200,
  height: 630,
  logoSize: 280,
  background: '#F8F6F0',
};

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
        .toFile(path.join(publicDir, name));

      console.log(`✅ 生成 ${name} (${size}x${size})`);
    }

    const logoBuffer = await sharp(svgBuffer)
      .resize(ogImage.logoSize, ogImage.logoSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({
        quality: 100,
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();

    await sharp({
      create: {
        width: ogImage.width,
        height: ogImage.height,
        channels: 4,
        background: ogImage.background,
      },
    })
      .composite([
        {
          input: logoBuffer,
          left: Math.round((ogImage.width - ogImage.logoSize) / 2),
          top: Math.round((ogImage.height - ogImage.logoSize) / 2),
        },
      ])
      .png({
        quality: 100,
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toFile(path.join(publicDir, ogImage.name));

    console.log(`✅ 生成 ${ogImage.name} (${ogImage.width}x${ogImage.height})`);

    console.log('🎉 所有 logo 文件生成完成！');
  } catch (error) {
    console.error('❌ 生成 logo 时出错:', error);
    process.exit(1);
  }
}

generateLogos();
