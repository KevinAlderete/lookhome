export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  createdAt: string;
  readAt: string | null;
};

export type AppNotificationPage = {
  items: AppNotification[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
  hasMore: boolean;
};
