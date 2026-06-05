import NavBar from '../components/NavBar';
import SupportChat from '../components/SupportChat';
import { sendAdminSupportMessage, ChatMessage } from '../api/support';

async function handleSend(message: string, history: ChatMessage[]): Promise<string> {
  const res = await sendAdminSupportMessage(message, history);
  return res.reply;
}

export default function AdminSupportPage() {
  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container support-page">
        <div className="page-header">
          <div>
            <h1>Assistant support</h1>
            <p className="support-page-subtitle">
              Obtenez une réponse sur les comptes, les lignes et le pilotage administratif.
            </p>
          </div>
        </div>
        <SupportChat onSend={handleSend} />
      </main>
    </>
  );
}
