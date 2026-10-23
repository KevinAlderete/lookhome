import { IsEnum, IsUUID } from "class-validator";

export enum ReviewVoteDto {
  HELPFUL = "helpful",
  NOT_HELPFUL = "not_helpful",
}

export class VoteReviewDto {
  @IsUUID("4")
  reviewId!: string;

  @IsEnum(ReviewVoteDto)
  vote!: ReviewVoteDto;
}
