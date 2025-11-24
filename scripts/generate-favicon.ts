import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';

async function generateFavicon() {
  try {
    const png16Path = path.join(process.cwd(), 'public/favicon-16x16.png');
    const png32Path = path.join(process.cwd(), 'public/favicon-32x32.png');
    const icoPath = path.join(process.cwd(), 'public/favicon.ico');

    // 生成 ICO 文件
    const icoBuffer = await pngToIco([png16Path, png32Path]);
    fs.writeFileSync(icoPath, icoBuffer);

    console.log('✅ 生成 favicon.ico');
  } catch (error) {
    console.error('❌ 生成 favicon.ico 时出错:', error);
    process.exit(1);
  }
}

generateFavicon();
