import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { FindConversationsQueryDto } from "./dto/find-conversations-query.dto";
import { MessagesService } from "../messages/messages.service";
import { SendMessageDto } from "../messages/dto/send-message.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";

@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Post()
  createConversation(
    @CurrentUser() user: any,
    @Body() body: CreateConversationDto,
  ) {
    return this.conversationsService.createConversation(user.id, body);
  }

  @Get("me")
  listMine(
    @CurrentUser() user: any,
    @Query() query: FindConversationsQueryDto,
  ) {
    return this.conversationsService.listMine(user.id, query);
  }

  @Get(":id/block-status")
  @Ownership("conversation-participant")
  getBlockStatus(@CurrentUser() user: any, @Param("id") id: string) {
    return this.conversationsService.getBlockStatus(user.id, id);
  }

  @Post(":id/block")
  @Ownership("conversation-participant")
  blockParticipant(@CurrentUser() user: any, @Param("id") id: string) {
    return this.conversationsService.blockParticipant(user.id, id);
  }

  @Delete(":id/block")
  @Ownership("conversation-participant")
  unblockParticipant(@CurrentUser() user: any, @Param("id") id: string) {
    return this.conversationsService.unblockParticipant(user.id, id);
  }

  @Get(":id")
  @Ownership("conversation-participant")
  findOne(@CurrentUser() user: any, @Param("id") id: string) {
    return this.conversationsService.findOne(user.id, id);
  }

  @Post("messages")
  @Ownership("conversation-participant")
  sendMessage(@CurrentUser() user: any, @Body() body: SendMessageDto) {
    return this.messagesService.sendMessage(user.id, body);
  }

  @Patch(":id/read")
  @Ownership("conversation-participant")
  markRead(@CurrentUser() user: any, @Param("id") id: string) {
    return this.messagesService.markConversationRead(user.id, id);
  }
}
