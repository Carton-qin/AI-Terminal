import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary caught error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearCacheAndReload = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (e) {
      console.error('Failed to clear storage:', e)
    }
    window.location.reload()
  }

  handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message || String(this.state.error)}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`
    navigator.clipboard?.writeText(errorDetails).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#0d1117] text-gray-200 flex items-center justify-center p-6 z-[99999] select-text">
          <div className="max-w-xl w-full bg-[#161b22] border border-red-500/40 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-400">
              <svg className="w-8 h-8 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-gray-100">界面渲染遇到异常</h2>
                <p className="text-xs text-gray-400">Component Render Error - 捕获到未处理的前端异常</p>
              </div>
            </div>

            <div className="bg-[#090d13] border border-gray-800 rounded-lg p-3 text-xs font-mono text-red-300 break-all max-h-48 overflow-y-auto">
              <div className="font-semibold text-red-400 mb-1">
                {this.state.error?.message || String(this.state.error)}
              </div>
              {this.state.error?.stack && (
                <div className="text-[11px] text-gray-400 mt-2 whitespace-pre-wrap">
                  {this.state.error.stack}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={this.handleCopy}
                className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded bg-gray-800/60 hover:bg-gray-800 transition-colors"
              >
                {this.state.copied ? '已复制到剪贴板 ✓' : '复制错误详情'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={this.handleClearCacheAndReload}
                  className="text-xs text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                >
                  清空缓存重置
                </button>
                <button
                  onClick={this.handleReload}
                  className="text-xs text-white font-medium px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 transition-colors"
                >
                  刷新重试
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
