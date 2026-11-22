import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // ExcelJS（約0.9MB）は「Excel出力」を押したときだけ読み込む別ファイルなので、警告の上限を上げておく
    chunkSizeWarningLimit: 1000,
  },
});
