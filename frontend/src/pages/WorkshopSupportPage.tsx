import WorkshopNavBar from '../components/WorkshopNavBar';
import SupportChat from '../components/SupportChat';
import { sendWorkshopSupportMessage } from '../api/support';
import type { ChatMessage } from '../api/support';
import { usePageTitle } from '../hooks/usePageTitle';

async function handleSend(
  message: string,
  history: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const res = await sendWorkshopSupportMessage(message, history, signal);
  return res.reply;
}

export default function WorkshopSupportPage() {
  usePageTitle('Assistance atelier');
  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container support-page">
        <SupportChat onSend={handleSend} />
      </main>
    </>
  );
}
