import type { ILoggerComponent } from '@well-known-components/interfaces'

export interface ComponentsWithLogger {
  components: {
    logs: ILoggerComponent
  }
}
