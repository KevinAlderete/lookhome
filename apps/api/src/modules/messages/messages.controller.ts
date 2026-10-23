import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  Query,
  Sse,
  MessageEvent,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { MessagesService } from "./messages.service";
import { MessageEventsService } from "./message-events.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateMessageDto } from "./dto/update-message.dto";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { Ownership } from "../auth/decorators/ownership.decorator";

@Controller("messages")
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messageEvents: MessageEventsService,
  ) {}

  @Sse("events")
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  streamEvents(@CurrentUser() user: any): Observable<MessageEvent> {
    return this.messageEvents.streamForUser(user.id);
  }

  @Post()
  @Ownership("conversation-participant")
  sendMessage(@CurrentUser() user: any, @Body() body: SendMessageDto) {
    return this.messagesService.sendMessage(user.id, body);
  }

  @Get("conversation/:conversationId")
  @Ownership("conversation-participant")
  listConversationMessages(
    @CurrentUser() user: any,
    @Param("conversationId") conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messagesService.listConversationMessages(
      user.id,
      conversationId,
      query,
    );
  }

  @Patch(":id")
  updateMessage(
    @CurrentUser() user: any,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: UpdateMessageDto,
  ) {
    return this.messagesService.updateMessage(user.id, id, body);
  }

  @Delete(":id")
  removeMessage(
    @CurrentUser() user: any,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.messagesService.removeMessage(user.id, id);
  }

  @Patch("conversation/:conversationId/read")
  @Ownership("conversation-participant")
  markConversationRead(
    @CurrentUser() user: any,
    @Param("conversationId") conversationId: string,
  ) {
    return this.messagesService.markConversationRead(user.id, conversationId);
  }
}
