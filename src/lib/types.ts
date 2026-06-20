export type Status =
  | 'starting'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'idle';

export interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentState {
  status: Status;
  conversation: Message[];
  logs: string[];
}

export interface AgentOptions {
  intro?: string;
  gap?: number;
  silent?: boolean;
  noWarmup?: boolean;
  onStateChange: (state: AgentState) => void;
}
