import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { AgentTeamController } from './controller.ts'
import { errorText } from './controller.ts'

interface SlotErrorBoundaryProps {
  controller: AgentTeamController
  testId: string
  children: ReactNode
}

interface SlotErrorBoundaryState { error: string }

/** Keeps a malformed Host payload or unexpected render defect inside this plugin's slot. */
export class SlotErrorBoundary extends Component<SlotErrorBoundaryProps, SlotErrorBoundaryState> {
  override state: SlotErrorBoundaryState = { error: '' }

  static getDerivedStateFromError(reason: unknown): SlotErrorBoundaryState {
    return { error: errorText(reason) }
  }

  override componentDidCatch(reason: unknown, info: ErrorInfo): void {
    // 边界只把「消息」呈现给用户，但根因定位需要堆栈：显式写入控制台，
    // 否则异常在 UI 层被吞掉，无法从浏览器控制台或日志回溯（实测教训）。
    const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    console.error('[agent-team-gui] slot crashed:', detail, '\ncomponent stack:', info.componentStack)
  }

  private readonly retry = async (): Promise<void> => {
    try {
      await this.props.controller.load(true)
      this.setState({ error: '' })
    } catch (reason) {
      this.setState({ error: errorText(reason, this.props.controller.i18n.t) })
    }
  }

  override render(): ReactNode {
    if (this.state.error === '') return this.props.children
    const t = this.props.controller.i18n.t
    return <div className="atg-slot-fallback" data-testid={this.props.testId} role="alert">
      <strong>{t('slotCrashed')}</strong>
      <span>{t('slotCrashedDetail')}</span>
      <small>{this.state.error}</small>
      <button type="button" className="atg-button primary" onClick={() => { void this.retry() }}>{t('retry')}</button>
    </div>
  }
}
