import React, { useState } from 'react'
import { Copy, Check, Play, Terminal } from 'lucide-react'

// 辅助函数：解析行内 Markdown（加粗、斜体、行内代码、链接）
function renderInlineMarkdown(text) {
  if (!text) return null

  // 正则匹配: 行内代码 `code` | 加粗 **bold** | 斜体 *italic* | 链接 [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(regex)

  return parts.map((part, index) => {
    if (!part) return null

    // 1. 行内代码 `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeContent = part.slice(1, -1)
      return (
        <code
          key={index}
          className="mx-0.5 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#21262d] text-cyan-800 dark:text-cyan-300 font-mono text-[11px] border border-slate-300/80 dark:border-gray-700/60 select-text"
        >
          {codeContent}
        </code>
      )
    }

    // 2. 加粗 **bold**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldContent = part.slice(2, -2)
      return (
        <strong key={index} className="font-semibold text-slate-900 dark:text-gray-100">
          {boldContent}
        </strong>
      )
    }

    // 3. 斜体 *italic*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicContent = part.slice(1, -1)
      return (
        <em key={index} className="italic text-slate-700 dark:text-gray-300">
          {italicContent}
        </em>
      )
    }

    // 4. 链接 [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline mx-0.5"
        >
          {linkMatch[1]}
        </a>
      )
    }

    return part
  })
}

// 独立代码块组件（带语言标签、复制与终端注入按钮）
function CodeBlock({ language, code, onInjectCommand }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isShell = !language || ['bash', 'sh', 'zsh', 'shell', 'cmd', 'ps1'].includes(language.toLowerCase())

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-slate-200 dark:border-[#30363d] bg-slate-900 text-gray-200 shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/90 border-b border-slate-700/60 text-[10px] text-gray-400">
        <div className="flex items-center space-x-1 font-mono uppercase tracking-wider text-cyan-400">
          <Terminal size={12} />
          <span>{language || 'bash'}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 bg-slate-700/60 hover:bg-slate-700 text-gray-300 rounded flex items-center space-x-1 transition"
            title="复制代码"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          {isShell && onInjectCommand && (
            <button
              onClick={() => onInjectCommand(code)}
              className="px-2 py-0.5 bg-cyan-600/80 hover:bg-cyan-600 text-white rounded flex items-center space-x-1 transition font-medium"
              title="注入到当前终端"
            >
              <Play size={11} />
              <span>注入终端</span>
            </button>
          )}
        </div>
      </div>
      <pre className="p-3 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre text-cyan-200 select-text">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function MarkdownRenderer({ content, onInjectCommand, className = '' }) {
  if (!content) return null

  // 1. 将文本切分为块级元素（代码块、标题、列表、引用、段落）
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let inCodeBlock = false
  let codeLang = ''
  let codeLines = []
  let currentList = null // { type: 'ul' | 'ol', items: [] }

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList)
      currentList = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 处理代码块围栏 ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // 代码块结束
        blocks.push({
          type: 'code',
          language: codeLang,
          code: codeLines.join('\n'),
        })
        inCodeBlock = false
        codeLang = ''
        codeLines = []
      } else {
        // 代码块开始
        flushList()
        inCodeBlock = true
        codeLang = line.trim().slice(3).trim()
        codeLines = []
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // 列表项检测 (- , * , + 或者 1. 2. )
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/)
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/)

    if (ulMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push(ulMatch[3])
      continue
    }

    if (olMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push({ num: olMatch[2], text: olMatch[3] })
      continue
    }

    // 非列表行，刷新之前积攒的列表
    flushList()

    // 空行
    if (!line.trim()) {
      continue
    }

    // 标题检测 (#, ##, ###, ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push({
        type: 'heading',
        level,
        text: headingMatch[2],
      })
      continue
    }

    // 引用块 (> text)
    if (line.startsWith('>')) {
      blocks.push({
        type: 'quote',
        text: line.replace(/^>\s*/, ''),
      })
      continue
    }

    // 分割线 (--- 或者 ***)
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      continue
    }

    // 普通段落
    blocks.push({
      type: 'paragraph',
      text: line,
    })
  }

  // 结尾清理
  if (inCodeBlock) {
    blocks.push({
      type: 'code',
      language: codeLang,
      code: codeLines.join('\n'),
    })
  }
  flushList()

  return (
    <div className={`space-y-2 text-slate-800 dark:text-gray-200 text-[11.5px] leading-relaxed select-text ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return (
            <CodeBlock
              key={idx}
              language={block.language}
              code={block.code}
              onInjectCommand={onInjectCommand}
            />
          )
        }

        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h1 key={idx} className="font-bold text-slate-900 dark:text-white text-[14px] mt-3 mb-1 pb-1 border-b border-slate-200 dark:border-gray-800">
                {renderInlineMarkdown(block.text)}
              </h1>
            )
          }
          if (block.level === 2) {
            return (
              <h2 key={idx} className="font-bold text-slate-900 dark:text-white text-[13px] mt-2.5 mb-1 pb-0.5 border-b border-slate-200/80 dark:border-gray-800/80 text-cyan-800 dark:text-cyan-300">
                {renderInlineMarkdown(block.text)}
              </h2>
            )
          }
          if (block.level === 3) {
            return (
              <h3 key={idx} className="font-semibold text-slate-900 dark:text-gray-100 text-[12px] mt-2 mb-0.5">
                {renderInlineMarkdown(block.text)}
              </h3>
            )
          }
          return (
            <h4 key={idx} className="font-semibold text-slate-800 dark:text-gray-200 text-[11.5px] mt-1.5 mb-0.5">
              {renderInlineMarkdown(block.text)}
            </h4>
          )
        }

        if (block.type === 'ul') {
          return (
            <ul key={idx} className="my-1.5 pl-4 space-y-1 list-disc list-outside marker:text-cyan-500 dark:marker:text-cyan-400">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="text-slate-700 dark:text-gray-300">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === 'ol') {
          return (
            <ol key={idx} className="my-1.5 pl-4 space-y-1 list-decimal list-outside marker:text-slate-500 dark:marker:text-gray-400 marker:font-mono">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="text-slate-700 dark:text-gray-300">
                  {renderInlineMarkdown(item.text)}
                </li>
              ))}
            </ol>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={idx} className="my-1.5 pl-2.5 border-l-2 border-cyan-500/70 text-slate-600 dark:text-gray-400 italic">
              {renderInlineMarkdown(block.text)}
            </blockquote>
          )
        }

        if (block.type === 'hr') {
          return <hr key={idx} className="my-2 border-slate-200 dark:border-gray-800" />
        }

        return (
          <p key={idx} className="my-1 text-slate-700 dark:text-gray-300">
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}
