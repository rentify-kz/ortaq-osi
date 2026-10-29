import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import {
  ballotCompleteBody, ballotStartBody, cancelVoteBody, createVoteBody, paperBallotBody, sendNoticeBody, updateVoteBody,
  type BallotCompleteBody, type BallotStartBody, type CancelVoteBody, type CreateVoteBody, type PaperBallotBody, type SendNoticeBody, type UpdateVoteBody,
} from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { BallotsService } from './ballots.service'
import { ProtocolsService } from './protocols.service'
import { VotesService } from './votes.service'

const MEMBERS = ['CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT'] as const

/**
 * Голосования, docs/03 §11. Решения председателя — со step-up. Подпись бюллетеня и протокола
 * идёт через ЭЦП: она сильнее кода из приложения, а у секретаря-жильца второго фактора нет.
 */
@Controller('houses/:houseId')
export class VotesController {
  constructor(
    private readonly votes: VotesService,
    private readonly ballots: BallotsService,
    private readonly protocols: ProtocolsService,
  ) {}

  @HouseScope(...MEMBERS) @Get('votes')
  list() {
    return this.votes.list()
  }

  @HouseScope('CHAIRMAN') @Get('votes/secretary-candidates')
  secretaryCandidates() {
    return this.votes.secretaryCandidates()
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes')
  create(@Body(new ZodPipe(createVoteBody)) body: CreateVoteBody) {
    return this.votes.create(body)
  }

  @HouseScope(...MEMBERS) @Get('votes/:voteId')
  detail(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.votes.detail(id)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Patch('votes/:voteId')
  update(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateVoteBody)) body: UpdateVoteBody) {
    return this.votes.update(id, body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes/:voteId/send-notice') @HttpCode(200)
  sendNotice(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(sendNoticeBody)) body: SendNoticeBody) {
    return this.votes.sendNotice(id, body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes/:voteId/activate') @HttpCode(200)
  activate(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.votes.activate(id)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes/:voteId/cancel') @HttpCode(200)
  cancel(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelVoteBody)) body: CancelVoteBody) {
    return this.votes.cancel(id, body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes/:voteId/close') @HttpCode(200)
  close(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.votes.close(id)
  }

  @HouseScope('CHAIRMAN') @Post('votes/:voteId/remind') @HttpCode(200)
  remind(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.votes.remind(id)
  }

  @HouseScope(...MEMBERS) @Get('votes/:voteId/results')
  results(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.votes.results(id)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'RESIDENT') @Post('votes/:voteId/ballot/start')
  startBallot(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(ballotStartBody)) body: BallotStartBody) {
    return this.ballots.start(id, body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'RESIDENT') @Post('votes/:voteId/ballot/complete') @HttpCode(200)
  completeBallot(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(ballotCompleteBody)) body: BallotCompleteBody, @Req() req: Request) {
    return this.ballots.complete(id, body, { ip: req.ip, userAgent: req.header('user-agent') })
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('votes/:voteId/paper-ballots')
  paperBallot(@Param('voteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(paperBallotBody)) body: PaperBallotBody) {
    return this.ballots.paper(id, body)
  }

  @HouseScope(...MEMBERS) @Get('votes/:voteId/protocol')
  protocol(@Param('voteId', ParseUUIDPipe) id: string) {
    return this.protocols.byVote(id)
  }

  @HouseScope(...MEMBERS) @Post('protocols/:protocolId/sign')
  startSigning(@Param('protocolId', ParseUUIDPipe) id: string) {
    return this.protocols.startSigning(id)
  }

  @HouseScope(...MEMBERS) @Post('protocols/:protocolId/sign/complete') @HttpCode(200)
  completeSigning(@Param('protocolId', ParseUUIDPipe) id: string) {
    return this.protocols.completeSigning(id)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('protocols/:protocolId/publish') @HttpCode(200)
  publish(@Param('protocolId', ParseUUIDPipe) id: string) {
    return this.protocols.publish(id)
  }
}
