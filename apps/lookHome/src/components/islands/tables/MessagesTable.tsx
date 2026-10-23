type MessageRow = {
  id: string;
  conversationTitle: string;
  participantName: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount?: number;
};

type MessagesTableProps = {
  rows: MessageRow[];
  emptyText?: string;
};

export default function MessagesTable({
  rows,
  emptyText = "No hay mensajes para mostrar.",
}: MessagesTableProps) {
  if (!rows.length) {
    return (
      <div className="rounded-[24px] bg-white p-8 text-center shadow-[0_18px_50px_rgba(80,76,74,0.08)]">
        <p className="text-warm-gray/70">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_18px_50px_rgba(80,76,74,0.08)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-cream">
            <tr className="text-left text-sm text-warm-gray/70">
              <th className="px-5 py-4 font-semibold">Conversación</th>
              <th className="px-5 py-4 font-semibold">Participante</th>
              <th className="px-5 py-4 font-semibold">Último mensaje</th>
              <th className="px-5 py-4 font-semibold">Actualizado</th>
              <th className="px-5 py-4 font-semibold">No leídos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-warm-gray/8 text-sm">
                <td className="px-5 py-4 font-semibold text-warm-gray">
                  {row.conversationTitle}
                </td>
                <td className="px-5 py-4 text-warm-gray/75">
                  {row.participantName}
                </td>
                <td className="px-5 py-4 text-warm-gray/75">
                  {row.lastMessage}
                </td>
                <td className="px-5 py-4 text-warm-gray/75">{row.updatedAt}</td>
                <td className="px-5 py-4">
                  {!!row.unreadCount && row.unreadCount > 0 ? (
                    <span className="rounded-full bg-terracotta px-2 py-1 text-xs font-bold text-white">
                      {row.unreadCount}
                    </span>
                  ) : (
                    <span className="text-warm-gray/50">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
