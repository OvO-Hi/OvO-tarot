/**
 * 리딩 본문(#reading-capture)을 브라우저 새 탭에서 열기 위한 독립 HTML 문자열을 만듭니다.
 *
 * 왜 이렇게 하나요?
 * - html2canvas는 Tailwind/복잡한 스타일에서 결과가 자주 깨집니다.
 * - 인쇄(Ctrl+P)나 "PDF로 저장", "다른 이름으로 저장"은 브라우저가 직접 렌더링하므로
 *   스타일이 가장 안정적으로 재현됩니다.
 * - Tailwind 클래스는 이 문서에 포함하지 않고, 아래 순수 CSS로만 꾸밉니다.
 *
 * [OvO 테마] 색상·클래스 접두어(lari → ovo)를 리브랜딩·소프트 모노 팔레트에 맞췄습니다.
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
      background: #f5f5f7;
      font-family: 'Noto Serif KR', Georgia, 'Times New Roman', serif;
      color: #2c2c2e;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ovo-toolbar {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px 40px 0;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #2c2c2e;
    }
    .ovo-toolbar button {
      background: linear-gradient(to right, #4a6fa5, #6b7fa3);
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 14px;
      cursor: pointer;
      margin-right: 12px;
    }
    .ovo-toolbar button:hover { filter: brightness(1.03); }
    .ovo-toolbar .hint { margin-top: 8px; color: #6e6e73; font-size: 12px; }
    @media print {
      .ovo-toolbar { display: none !important; }
    }
    .ovo-shell {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .ovo-card {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #e0e0e5;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(74, 111, 165, 0.12);
    }
    /* 캡처 영역에서 온 시맨틱 태그 */
    .ovo-card header { text-align: center; margin-bottom: 28px; }
    .ovo-card header p:first-child {
      font-size: 1.25rem;
      font-weight: 300;
      letter-spacing: 0.3em;
      margin: 0;
      color: #2c2c2e;
    }
    .ovo-card header p:last-child {
      margin: 10px 0 0;
      font-size: 12px;
      color: #6e6e73;
    }
    .ovo-card > section {
      margin-bottom: 28px;
    }
    .ovo-card > section:first-of-type {
      border: 1px solid #e0e0e5;
      background: #ffffff;
      border-radius: 12px;
      padding: 18px 20px;
    }
    .ovo-card > section:first-of-type h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
      color: #4a6fa5;
    }
    .ovo-card > section:first-of-type p {
      margin: 0;
      white-space: pre-wrap;
      font-size: 14px;
    }
    .ovo-card > section:nth-of-type(2) h2 {
      text-align: center;
      margin: 0 0 16px;
      font-size: 14px;
      font-weight: 600;
      color: #2c2c2e;
    }
    .ovo-card > section:nth-of-type(2) > div {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }
    .ovo-card > section:nth-of-type(2) > div > div {
      width: 4.8rem;
      min-height: 5.5rem;
      border: 1px solid #e0e0e5;
      border-radius: 10px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8px 4px;
      font-size: 9px;
    }
    .ovo-card > section:nth-of-type(2) span { display: block; }
    .ovo-card article { font-size: 15px; }
    /** ## 헤더: 본문과의 간격 — margin-bottom 12px (요청값과 동일) */
    .ovo-card article h2 {
      margin: 28px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e5;
      font-size: 16px;
      font-weight: 600;
      color: #4a6fa5;
    }
    .ovo-card article h2:first-child { margin-top: 0; }
    /** h2 바로 다음 본문(p): margin-top 8px — 화면(globals)과 동일 */
    .ovo-card article h2 + p {
      margin-top: 8px;
    }
    .ovo-card article h3 {
      margin: 22px 0 8px;
      font-size: 14px;
      font-weight: 600;
      color: #2c2c2e;
    }
    .ovo-card article p { margin: 0 0 14px; }
    .ovo-card article strong { font-weight: 600; color: #2c2c2e; }
    .ovo-card article em {
      font-style: normal;
      color: #6e6e73;
      text-decoration: underline;
      text-decoration-color: #e0e0e5;
      text-underline-offset: 3px;
    }
    .ovo-card article ul, .ovo-card article ol {
      margin: 0 0 14px;
      padding-left: 1.25rem;
    }
    .ovo-card article li { margin-bottom: 4px; }
    .ovo-card article hr {
      border: none;
      border-top: 1px solid #e0e0e5;
      margin: 28px 0;
    }
    /** 핵심 조언 등 blockquote: 연블루그레이 배경(화면 ReadingResult와 동일 톤) */
    .ovo-card article blockquote {
      margin: 20px 0;
      padding: 16px 20px;
      border: 1px solid #e0e0e5;
      border-radius: 10px;
      background: #eef1f8;
      font-size: 14px;
    }
    .ovo-card > div:not(:last-child) {
      margin-top: 28px;
    }
    .ovo-card > div h3 {
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      color: #2c2c2e;
      margin: 0 0 14px;
    }
    .ovo-card > div > div {
      border: 1px solid #e0e0e5;
      border-radius: 14px;
      background: #ffffff;
      padding: 18px;
      margin-bottom: 14px;
    }
    .ovo-card > div > div p { margin: 0 0 8px; font-size: 12px; color: #4a6fa5; }
    .ovo-card > div > div > div { font-size: 14px; white-space: pre-wrap; color: #2c2c2e; }
    .ovo-card > p:last-child {
      text-align: center;
      font-size: 10px;
      color: #6e6e73;
      margin: 28px 0 0;
    }
  `

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OvO TAROT — 리딩 (${ts})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontHref}" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="ovo-toolbar">
    <button type="button" onclick="window.print()">인쇄 / PDF로 저장</button>
    <span>또는 브라우저 메뉴에서 <strong>다른 이름으로 저장</strong>으로 HTML을 보관할 수 있어요.</span>
    <p class="hint">HTML로 저장할 때 파일명 예: <strong>ovo-tarot-reading-${ts}.html</strong> · 이미지(PNG)가 꼭 필요하면 PDF 저장 후 캡처하거나 OS 스크린샷을 권장합니다.</p>
  </div>
  <div class="ovo-shell">
    <div class="ovo-card">
      ${innerContentHtml}
    </div>
  </div>
</body>
</html>`
}
