import WorkshopNavBar from '../components/WorkshopNavBar';
import SupportChat from '../components/SupportChat';
import { sendWorkshopSupportMessage, ChatMessage } from '../api/support';
import { usePageTitle } from '../hooks/usePageTitle';

async function handleSend(message: string, history: ChatMessage[]): Promise<string> {
  const res = await sendWorkshopSupportMessage(message, history);
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
