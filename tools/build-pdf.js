const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');   // 章节 md 平铺在仓库根目录
const SRC = ROOT;
const OUT_PDF = path.join(ROOT, 'FDE-Handbook.pdf');
const OUT_MD = path.join(ROOT, 'FDE-Handbook-单文件.md');

// ---------- 1. concat ----------
const files = fs.readdirSync(SRC)
  .filter(f => /^\d\d-/.test(f) && f.endsWith('.md'))
  .sort();

let md = files.map(f => {
  let t = fs.readFileSync(path.join(SRC, f), 'utf8').trim();
  if (f.startsWith('00-')) {
    // 封面与目录已承载元信息和大纲，正文只保留前言部分
    const start = t.indexOf('## 这本书想解决什么');
    const end = t.indexOf('## 全书大纲');
    const preface = t.slice(start, end).replace(/\n---\n/g, '\n').trim();
    t = '# 前言\n\n' + preface;
  }
  return t;
}).join('\n\n');
fs.writeFileSync(OUT_MD, md);
console.log('merged', files.length, 'files,', md.length, 'chars');

// ---------- 2. md -> html, mermaid fences preserved ----------
const mermaidBlocks = [];
md = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
  mermaidBlocks.push(code);
  return `\n@@MERMAID${mermaidBlocks.length - 1}@@\n`;
});

marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
let body = marked.parse(md);

body = body.replace(/<p>@@MERMAID(\d+)@@<\/p>/g, (_, i) =>
  `<div class="mermaid-wrap"><pre class="mermaid">${mermaidBlocks[i]
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`);

// ---------- 3. build TOC from h1/h2 ----------
const toc = [];
body = body.replace(/<h([12])([^>]*)>([\s\S]*?)<\/h[12]>/g, (m, lvl, attrs, txt) => {
  const clean = txt.replace(/<[^>]+>/g, '').trim();
  const id = 'sec' + toc.length;
  toc.push({ lvl: +lvl, text: clean, id });
  let cls = '';
  if (lvl === '1') cls = ' class="part-title"';
  else cls = /^§/.test(clean) ? ' class="chapter-title"' : ' class="section-title"';
  return `<h${lvl} id="${id}"${cls}>${txt}</h${lvl}>`;
});

const tocHtml = toc.filter(t => t.lvl === 1 || /^§/.test(t.text)).map(t =>
  `<div class="toc-item toc-l${t.lvl}"><a href="#${t.id}">${t.text}</a></div>`).join('\n');

const mermaidJs = fs.readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>FDE Handbook</title>
<style>
:root{ --ink:#1a1a1a; --muted:#6b6b6b; --line:#e3e3e3; --accent:#c2410c; --accent-soft:#fff3ea; }
*{box-sizing:border-box}
body{
  font-family:"PingFang SC","Hiragino Sans GB","Songti SC",-apple-system,sans-serif;
  color:var(--ink); font-size:10.5pt; line-height:1.85; margin:0;
  -webkit-font-smoothing:antialiased;
}
/* ---- cover ---- */
.cover{ padding:52mm 6mm 0; break-after:page; page-break-after:always; }
.cover .bar{ width:56px;height:6px;background:var(--accent);margin-bottom:26px }
.cover h1{ font-size:40pt; line-height:1.15; margin:0 0 14px; letter-spacing:-1px; border:none; padding:0;
  break-before:avoid !important; page-break-before:avoid !important; }
.cover .sub{ font-size:15pt; color:var(--muted); margin-bottom:52px; line-height:1.6 }
.cover .meta{ font-size:10pt; color:var(--muted); line-height:2.1; border-top:1px solid var(--line); padding-top:20px }
.cover .meta b{ color:var(--ink); font-weight:600 }
/* ---- toc ---- */
.toc{ break-after:page; page-break-after:always; break-before:auto; }
.toc h2{ font-size:19pt; border:none; margin:0 0 22px; padding:0;
  break-before:avoid !important; page-break-before:avoid !important; }
.toc-item{ line-height:1.95; font-size:10pt }
.toc-l1{ font-weight:700; margin-top:15px; font-size:11pt; color:var(--accent) }
.toc-l2{ padding-left:16px; color:#333 }
.toc-item a{ color:inherit; text-decoration:none }
/* ---- headings ---- */
h1{ font-size:21pt; margin:0 0 20px; padding-bottom:12px;
    border-bottom:2.5px solid var(--accent); break-before:page; page-break-before:always; page-break-after:avoid; }
h1.part-title{ color:var(--accent) }
h2{ font-size:14pt; margin:26px 0 12px; page-break-after:avoid; }
h2.chapter-title{ font-size:17pt; margin:0 0 18px; padding-bottom:10px; color:var(--accent);
    border-bottom:2px solid var(--accent); break-before:page; page-break-before:always; }
h2.section-title{ padding-bottom:6px; border-bottom:1px solid var(--line); }
h1 + h2.chapter-title{ page-break-before:avoid }
h3{ font-size:12pt; margin:24px 0 10px; page-break-after:avoid; color:#2b2b2b }
/* ---- text ---- */
p{ margin:0 0 11px; text-align:justify }
strong{ font-weight:600; color:#000 }
a{ color:var(--accent); text-decoration:none; word-break:break-all }
ul,ol{ margin:0 0 12px; padding-left:22px } li{ margin-bottom:5px }
blockquote{ margin:16px 0; padding:12px 16px; background:var(--accent-soft);
  border-left:3px solid var(--accent); color:#4a3a30; page-break-inside:avoid }
blockquote p:last-child{ margin-bottom:0 }
hr{ border:none; border-top:1px solid var(--line); margin:26px 0 }
code{ font-family:"SF Mono",Menlo,monospace; font-size:8.8pt; background:#f5f5f5;
  padding:1px 5px; border-radius:3px }
pre{ background:#fafafa; border:1px solid var(--line); border-radius:5px;
  padding:12px 14px; overflow-x:auto; page-break-inside:avoid; margin:0 0 14px }
pre code{ background:none; padding:0; font-size:8.4pt; line-height:1.6 }
/* ---- tables ---- */
table{ border-collapse:collapse; width:100%; margin:14px 0; font-size:9pt;
  page-break-inside:avoid }
th,td{ border:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:top }
th{ background:#f7f7f7; font-weight:600 }
tr:nth-child(even) td{ background:#fcfcfc }
/* ---- mermaid ---- */
.mermaid-wrap{ text-align:center; margin:18px 0; page-break-inside:avoid }
.mermaid svg{ max-width:100%; height:auto }
@page{ size:A4; }
</style></head><body>

<div class="cover">
  <div class="bar"></div>
  <h1>FDE Handbook</h1>
  <div class="sub">FDE 手册<br>把 AI 装进企业：从需求识别到生产交付</div>
  <div class="meta">
    <div><b>创建者</b>　空格</div>
    <div><b>为谁创建</b>　想转型 FDE 的工程师和产品经理、正在组建 FDE 团队的 AI 公司、需要把 AI 落进业务的企业负责人</div>
    <div><b>基于</b>　Palantir / OpenAI / AWS / Anthropic 公开实践，MIT NANDA 与 LinkedIn 调研数据</div>
    <div><b>全书</b>　8 篇 32 章 + 8 个附录</div>
    <div><b>最后更新</b>　2026-08-31</div>
  </div>
</div>

<div class="toc"><h2>目录</h2>${tocHtml}</div>

${body}
<script>${mermaidJs}</script>
<script>
mermaid.initialize({ startOnLoad:false, theme:'base', fontFamily:'PingFang SC, sans-serif',
  themeVariables:{ primaryColor:'#fff3ea', primaryTextColor:'#1a1a1a', primaryBorderColor:'#c2410c',
    lineColor:'#8a8a8a', fontSize:'13px', secondaryColor:'#f5f5f5', tertiaryColor:'#fafafa' },
  flowchart:{ useMaxWidth:true, htmlLabels:true } });
window.__done = mermaid.run({ querySelector:'.mermaid' }).then(()=>true).catch(e=>{console.error(e);return true;});
</script>
</body></html>`;

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'book.html'), html);
console.log('html built,', html.length, 'chars,', mermaidBlocks.length, 'diagrams,', toc.length, 'toc entries');

// ---------- 4. render ----------
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, 'build', 'book.html'), { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => window.__done);
  await new Promise(r => setTimeout(r, 3000));
  const n = await page.evaluate(() => document.querySelectorAll('.mermaid svg').length);
  console.log('rendered diagrams:', n);
  await page.pdf({
    path: OUT_PDF, format: 'A4', printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8pt;color:#999;text-align:center;font-family:PingFang SC,sans-serif;padding-top:4px;">FDE Handbook · 空格 · <span class="pageNumber"></span></div>',
    margin: { top: '20mm', bottom: '18mm', left: '17mm', right: '17mm' },
  });
  await browser.close();
  console.log('PDF ->', OUT_PDF);
})();
