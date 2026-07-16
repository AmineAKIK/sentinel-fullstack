import NavBar from '../components/NavBar';
import SupportChat from '../components/SupportChat';
import { sendAdminSupportMessage } from '../api/support';
import type { ChatMessage } from '../api/support';
import { usePageTitle } from '../hooks/usePageTitle';

async function handleSend(
  message: string,
  history: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const res = await sendAdminSupportMessage(message, history, signal);
  return res.reply;
}

export default function AdminSupportPage() {
  usePageTitle('Assistance administration');
  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container support-page">
        <SupportChat onSend={handleSend} />
      </main>
    </>
  );
}
