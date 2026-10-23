import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { VoteReviewDto } from "./dto/vote-review.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { FindPublicReviewsDto } from "./dto/find-public-reviews.dto";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  createReview(@CurrentUser() user: any, @Body() body: CreateReviewDto) {
    return this.reviewsService.createReview(user.id, body);
  }

  @Post("vote")
  voteReview(@CurrentUser() user: any, @Body() body: VoteReviewDto) {
    return this.reviewsService.voteReview(user.id, body);
  }

  @Get("booking/:bookingId/me")
  getMyBookingReviewStatus(
    @CurrentUser() user: any,
    @Param("bookingId", new ParseUUIDPipe({ version: "4" })) bookingId: string,
  ) {
    return this.reviewsService.getMyBookingReviewStatus(user.id, bookingId);
  }

  @Get("room/:roomId")
  @Public()
  listRoomReviews(
    @Param("roomId", new ParseUUIDPipe({ version: "4" })) roomId: string,
    @Query() query: FindPublicReviewsDto,
  ) {
    return this.reviewsService.listRoomReviews(roomId, query);
  }

  @Get("user/:userId")
  @Public()
  listUserReviews(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Query() query: FindPublicReviewsDto,
  ) {
    return this.reviewsService.listUserReviews(userId, query);
  }
}
