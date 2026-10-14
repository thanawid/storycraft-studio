import { build } from 'vite';
await build({configFile:false,build:{outDir:'worker-dist',emptyOutDir:true,minify:false,sourcemap:false,lib:{entry:'backend/kling-worker.js',formats:['es'],fileName:()=> 'kling-worker.js'},target:'es2022'}});
