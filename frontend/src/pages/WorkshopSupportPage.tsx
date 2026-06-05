import WorkshopNavBar from '../components/WorkshopNavBar';
import SupportChat from '../components/SupportChat';
import { sendWorkshopSupportMessage, ChatMessage } from '../api/support';

async function handleSend(message: string, history: ChatMessage[]): Promise<string> {
  const res = await sendWorkshopSupportMessage(message, history);
  return res.reply;
}

export default function WorkshopSupportPage() {
  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container support-page">
        <div className="page-header">
          <div>
            <h1>Assistant support</h1>
            <p className="support-page-subtitle">
              Obtenez une réponse sur les incidents, les rôles et les workflows atelier.
            </p>
          </div>
        </div>
        <SupportChat onSend={handleSend} />
      </main>
    </>
  );
}
