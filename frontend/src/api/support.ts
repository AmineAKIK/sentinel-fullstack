import { api } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
}

export function sendAdminSupportMessage(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal
): Promise<ChatResponse> {
  return api.post<ChatResponse>('/api/admin/support/chat', { message, history }, signal);
}

export function sendWorkshopSupportMessage(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal
): Promise<ChatResponse> {
  return api.post<ChatResponse>('/api/workshop/support/chat', { message, history }, signal);
}
