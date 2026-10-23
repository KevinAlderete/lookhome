import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { MessageEventsService } from "./message-events.service";

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessageEventsService],
  exports: [MessagesService, MessageEventsService],
})
export class MessagesModule {}
