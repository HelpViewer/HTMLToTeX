function rowsToArray(t) {
  if (!t) return [];
  return t.replace(/\r\n|\r/g, '\n').split('\n');
}

function HTMLToTeX(parent, header, activeLanguage, config, ctx, document, author) {
  function clearHash(text) {
    let cleanedText = text;
    if (text.endsWith('#'))
      cleanedText = text.substring(0, text.length - 1);
    return cleanedText.trim();
  }

  const handlerBold = (node, ctx, children) => `\\textbf\{${children}\}`;

  function getLabel(node) {
    if (node?.lastChild?.getAttribute)
      return `\\label\{sec:${node.lastChild.getAttribute('href').substring(1).replace(/-/g, '--')}\}`;
    return '';
  }

  const handlers = {
    ul: (node, ctx, children) => {
      ctx.listStack.push('itemize');
      const body = children;
      ctx.listStack.pop();
      return `\\begin{itemize}\n${body}\\end{itemize}\n`;
    },
    ol: (node, ctx, children) => {
      ctx.listStack.push('enumerate');
      const body = children;
      ctx.listStack.pop();
      return `\\begin{enumerate}\n${body}\\end{enumerate}\n`;
    },
    li: (node, ctx, children) => {
      return `\\item ${children}\n`;
    },
    img: (node, ctx, children) => {
      ctx.i_img++;
      const path = ctx.embeds.get(node.src) || '';
      return `\\begin{figure}[H]\n\\centering\n\\includegraphics\{${path}\}\n\\caption{${node.title || ''}}\n\\label{fig:I_${ctx.i_img}}\n\\end{figure}\n`;
    },
    svg: (node, ctx, children) => {
      ctx.i_svg++;
      const path = ctx.embeds.get(node) || '';
      return `\\begin{figure}[H]\n\\centering\n\\includesvg\{${path}\}\n\\caption{${node.title || ''}}\n\\label{fig:IS_${ctx.i_svg}}\n\\end{figure}\n`;
    },
    h1: (node, ctx, children) => `\\section\{${clearHash(children)}\}${getLabel(node)}\n`,
    h2: (node, ctx, children) => `\\subsection\{${clearHash(children)}\}${getLabel(node)}\n`,
    h3: (node, ctx, children) => `\\subsubsection\{${clearHash(children)}\}${getLabel(node)}\n`,
    h4: (node, ctx, children) => `\\paragraph\{${clearHash(children)}\}${getLabel(node)}\n`,
    h5: (node, ctx, children) => `\\subparagraph\{${clearHash(children)}\}${getLabel(node)}\n`,
    h6: (node, ctx, children) => `\\subsubparagraph\{${clearHash(children)}\}${getLabel(node)}\n`,
    p: (node, ctx, children) => `${children}\\par\n`,

    div: (node, ctx, children) => {
      if (node.classList.contains('toolbar-item') || node.classList.contains('toolbar'))
        return '';

      if (node.classList.contains('page-break'))
        return '\\newpage';

      return children;
    },

    code: (node, ctx, children) => {
      if (node.classList.length == 0)
        return children;

      const codeText = node.textContent;
      const prefix = 'language-';
      const langClass = Array.from(node.classList).find(cls => cls.startsWith(prefix));
      let lang = langClass ? langClass.replace(prefix, '') : '{}';
      lang = lang == 'none' ? '{}' : lang;

      return `\\begin{lstlisting}[language=${lang}, caption={}]\n${codeText}\\end{lstlisting}`;
    },

    strong: handlerBold,
    b: handlerBold,
    em: (node, ctx, children) => `\\emph\{${children}\}\n`,
    //TODO: Beware of \\end{tabularx} used elsewhere wantedly because of HTML to TeX wrong output.
    table: (node, ctx, children) => `\\begin{center}\\begin{longtable}%${children}\n \\end{longtable}\\end{center}\n`,
    thead: (node, ctx, children) => {
      let cols = rowsToArray(children.trim());
      const mCols = 'l|'.repeat(cols.length - 1);
      const mColData = cols.map(c => `\\textbf{${c}}`).join(' & ');
      return `{|${mCols}p{6.5cm}|}\n\\hline\n${mColData} \n\\\\ \\hline\n\\endhead\n`;
    },

    td: (node, ctx, children) => children,

    tr: (node, ctx, children) => {
      if (node.parentElement.tagName.toLowerCase() === 'thead') return children;

      const tds = Array.from(node.children).filter(child => 
        child.tagName.toLowerCase() === 'td' || child.tagName.toLowerCase() === 'th'
      );
      
      const colTexts = tds.map(td => walk(td, ctx));
      return colTexts.join(' & ') + ' \n\\\\ \\hline';
    },

    a: (node, ctx, children) => {
      if (children.trim().replace('\\#', '#').length == 1)
        return '';
      
      let href = node.getAttribute('href') || '';
      if (!href) {
        href = node.getAttribute('id') || '';
        if (href)
          return `\\phantomsection\n\\label{sec:${href.replace(/-/g, '--')}}\n`;
      }

      href = decodeURI(href);
      href = href
        .replace(/([#\$%&~^{}])/g, '\\$1')
        .replace(/_/g, '\\_');
      
      if (href.startsWith('http'))
        return `\\href{${href}}{${children}}`;
      
      href = node.getAttribute('href').replace(/-/g, '--') || '';
      if (href.startsWith('#'))
        return `\\hyperref[sec:${href.substring(1)}]{${children}}`;
      else
        return `\\href{${decodeURI(node.href)}}{${children}}`;
    },

    script: (node, ctx, children) => '',
    style: (node, ctx, children) => '',
    br: (node, ctx, children) => `\n\\par ${children}`,

    default: (node, ctx, children) => children
  };

  function escapeLaTeX(text) {
    return text.replace(/([_%&#$\\~^])/g, match => {
      const escapes = {
        '%': '\\%',
        '_': '\\_',
        '#': '\\#',
        '$': '\\$',
        '\\': '\\\\',
        '~': '\\~{}',
        '^': '\\^{}'
      };
      return escapes[match];
    });
  }

  function walk(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) 
      return escapeLaTeX(node.textContent);
    const children = Array.from(node.childNodes)
      .map(child => walk(child, ctx))
      .join('');
    const tag = node.nodeName.toLowerCase();
    const handler = handlers[tag] || handlers.default;
    return handler(node, ctx, children);
  }

  // TODO : Resolve author name in export
  document = document.replace(/_AUTH_/g, author);
  document = document.replace(/_DOCNAME_/g, header);
  document = document.replace(/_LANG_/g, config[activeLanguage] || activeLanguage);
  document = document.replace(/_LSTSET_/g, config[`${activeLanguage}-lstset`] || '');

  const latex = walk(parent, ctx);
  return [document, latex];
}
