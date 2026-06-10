import NavBar from '../components/NavBar';
import SupportChat from '../components/SupportChat';
import { sendAdminSupportMessage, ChatMessage } from '../api/support';
import { usePageTitle } from '../hooks/usePageTitle';

async function handleSend(message: string, history: ChatMessage[]): Promise<string> {
  const res = await sendAdminSupportMessage(message, history);
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
