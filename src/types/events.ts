export interface CodexEventMessage {
  type: string;
  [key: string]: unknown;
}

export interface CodexEvent {
  id: string;
  msg: CodexEventMessage;
}
