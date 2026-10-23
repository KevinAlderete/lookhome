import { apiServer } from "@/lib/api/server";

export async function getRoomRules(request: Request, roomId: string) {
  return apiServer<any>(request, `/availability/rules/room/${roomId}`);
}

export async function getRoomBlocks(request: Request, roomId: string) {
  return apiServer<any>(request, `/availability/blocks/room/${roomId}`);
}
