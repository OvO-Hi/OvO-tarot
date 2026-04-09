/**
 * 리딩 본문(#reading-capture)을 브라우저 새 탭에서 열기 위한 독립 HTML 문자열을 만듭니다.
 *
 * 왜 이렇게 하나요?
 * - html2canvas는 Tailwind/복잡한 스타일에서 결과가 자주 깨집니다.
 * - 인쇄(Ctrl+P)나 "PDF로 저장", "다른 이름으로 저장"은 브라우저가 직접 렌더링하므로
 *   스타일이 가장 안정적으로 재현됩니다.
 * - Tailwind 클래스는 이 문서에 포함하지 않고, 아래 순수 CSS로만 꾸밉니다.
 */

/** DOM에서 class/style 속성을 제거해 인쇄용 HTML이 우리 CSS에만 의존하게 합니다 */
export function stripClassesAndInlineStyles(el: HTMLElement): void {
  el.removeAttribute('class')
  el.removeAttribute('className')
  el.removeAttribute('style')
  for (const child of Array.from(el.children)) {
    stripClassesAndInlineStyles(child as HTMLElement)
  }
}

/**
 * reading-capture 루트의 outerHTML(또는 inner)을 감싸 완전한 HTML 문서로 만듭니다.
 * @param innerContentHtml class 제거된 캡처 영역 안쪽 HTML (보통 clone.innerHTML)
 */
export function buildStandaloneReadingHtml(innerContentHtml: string): string {
  /** 브라우저 "다른 이름으로 저장" 시 참고할 수 있도록 문서 제목에 타임스탬프를 넣습니다 */
  const ts = Date.now()
  const fontHref =
    'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@200;300;400;500;600;700&display=swap'

  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: #fdf0f0;
      font-family: 'Noto Serif KR', Georgia, 'Times New Roman', serif;
      color: #6b4c52;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .lari-toolbar {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px 40px 0;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #6b4c52;
    }
    .lari-toolbar button {
      background: linear-gradient(to right, #c8748a, #d4956a);
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 14px;
      cursor: pointer;
      margin-right: 12px;
    }
    .lari-toolbar button:hover { filter: brightness(1.03); }
    .lari-toolbar .hint { margin-top: 8px; color: #a07880; font-size: 12px; }
    @media print {
      .lari-toolbar { display: none !important; }
    }
    .lari-shell {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .lari-card {
      background: rgba(255, 250, 250, 0.95);
      border: 1px solid #f0d0d5;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(200, 116, 138, 0.12);
    }
    /* 캡처 영역에서 온 시맨틱 태그 */
    .lari-card header { text-align: center; margin-bottom: 28px; }
    .lari-card header p:first-child {
      font-size: 1.25rem;
      font-weight: 300;
      letter-spacing: 0.3em;
      margin: 0;
      color: #6b4c52;
    }
    .lari-card header p:last-child {
      margin: 10px 0 0;
      font-size: 12px;
      color: #a07880;
    }
    .lari-card > section {
      margin-bottom: 28px;
    }
    .lari-card > section:first-of-type {
      border: 1px solid #e8d4d8;
      background: #fffafa;
      border-radius: 12px;
      padding: 18px 20px;
    }
    .lari-card > section:first-of-type h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
      color: #c8748a;
    }
    .lari-card > section:first-of-type p {
      margin: 0;
      white-space: pre-wrap;
      font-size: 14px;
    }
    .lari-card > section:nth-of-type(2) h2 {
      text-align: center;
      margin: 0 0 16px;
      font-size: 14px;
      font-weight: 600;
      color: #6b4c52;
    }
    .lari-card > section:nth-of-type(2) > div {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }
    .lari-card > section:nth-of-type(2) > div > div {
      width: 4.8rem;
      min-height: 5.5rem;
      border: 1px solid #f0d0d5;
      border-radius: 10px;
      background: #fffafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8px 4px;
      font-size: 9px;
    }
    .lari-card > section:nth-of-type(2) span { display: block; }
    .lari-card article { font-size: 15px; }
    /** ## 헤더: 본문과의 간격 — margin-bottom 12px (요청값과 동일) */
    .lari-card article h2 {
      margin: 28px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0d0d5;
      font-size: 16px;
      font-weight: 600;
      color: #c8748a;
    }
    .lari-card article h2:first-child { margin-top: 0; }
    /** h2 바로 다음 본문(p): margin-top 8px — 화면(globals)과 동일 */
    .lari-card article h2 + p {
      margin-top: 8px;
    }
    .lari-card article h3 {
      margin: 22px 0 8px;
      font-size: 14px;
      font-weight: 600;
      color: #6b4c52;
    }
    .lari-card article p { margin: 0 0 14px; }
    .lari-card article strong { font-weight: 600; color: #6b4c52; }
    .lari-card article em {
      font-style: normal;
      color: #a07880;
      text-decoration: underline;
      text-decoration-color: #f0d0d5;
      text-underline-offset: 3px;
    }
    .lari-card article ul, .lari-card article ol {
      margin: 0 0 14px;
      padding-left: 1.25rem;
    }
    .lari-card article li { margin-bottom: 4px; }
    .lari-card article hr {
      border: none;
      border-top: 1px solid #f0d0d5;
      margin: 28px 0;
    }
    .lari-card article blockquote {
      margin: 20px 0;
      padding: 16px 20px;
      border: 1px solid #f0d0d5;
      border-radius: 10px;
      background: linear-gradient(to bottom right, #fce8e8, #fffafa);
      font-size: 14px;
    }
    .lari-card > div:not(:last-child) {
      margin-top: 28px;
    }
    .lari-card > div h3 {
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      color: #6b4c52;
      margin: 0 0 14px;
    }
    .lari-card > div > div {
      border: 1px solid #f0d0d5;
      border-radius: 14px;
      background: #fffafa;
      padding: 18px;
      margin-bottom: 14px;
    }
    .lari-card > div > div p { margin: 0 0 8px; font-size: 12px; color: #c8748a; }
    .lari-card > div > div > div { font-size: 14px; white-space: pre-wrap; color: #6b4c52; }
    .lari-card > p:last-child {
      text-align: center;
      font-size: 10px;
      color: #a07880;
      margin: 28px 0 0;
    }
  `

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LARI TAROT — 리딩 (${ts})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontHref}" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="lari-toolbar">
    <button type="button" onclick="window.print()">인쇄 / PDF로 저장</button>
    <span>또는 브라우저 메뉴에서 <strong>다른 이름으로 저장</strong>으로 HTML을 보관할 수 있어요.</span>
    <p class="hint">HTML로 저장할 때 파일명 예: <strong>lari-tarot-reading-${ts}.html</strong> · 이미지(PNG)가 꼭 필요하면 PDF 저장 후 캡처하거나 OS 스크린샷을 권장합니다.</p>
  </div>
  <div class="lari-shell">
    <div class="lari-card">
      ${innerContentHtml}
    </div>
  </div>
</body>
</html>`
}
