import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  approveTaskBody, completeTaskBody, createStagesBody, createTaskBody, rejectTaskBody, updateStageBody, updateTaskBody,
  type ApproveTaskBody, type CompleteTaskBody, type CreateTaskBody, type UpdateStageBody, type UpdateTaskBody,
} from '@ortaq/shared'
import { z } from 'zod'
import { HouseScope, Rate } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { StagesService } from './stages.service'
import { TasksService } from './tasks.service'

const listQuery = z.object({ scope: z.enum(['active', 'all']).default('active') })

/** Этапы и задачи, docs/03 §8–9. Пути под домом: членство проверяется первым */
@Controller('houses/:houseId')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly stages: StagesService,
  ) {}

  @HouseScope('CHAIRMAN') @Post('requests/:requestId/stages')
  addStages(@Param('requestId', ParseUUIDPipe) requestId: string, @Body(new ZodPipe(createStagesBody)) body: z.input<typeof createStagesBody>) {
    return this.stages.add(requestId, body)
  }

  /** Председатель или исполнитель задачи этого этапа — права проверяет сервис */
  @HouseScope('CHAIRMAN', 'WORKER') @Patch('requests/:requestId/stages/:stageId')
  updateStage(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body(new ZodPipe(updateStageBody)) body: UpdateStageBody,
  ) {
    return this.stages.update(requestId, stageId, body)
  }

  @HouseScope('CHAIRMAN') @Get('tasks')
  list(@Query(new ZodPipe(listQuery)) q: z.input<typeof listQuery>) {
    return this.tasks.list(q.scope ?? 'active')
  }

  @HouseScope('CHAIRMAN') @Get('tasks/assignees')
  assignees() {
    return this.tasks.assignees()
  }

  @HouseScope('WORKER') @Get('my-tasks')
  mine() {
    return this.tasks.mine()
  }

  @HouseScope('CHAIRMAN') @Post('tasks')
  create(@Body(new ZodPipe(createTaskBody)) body: CreateTaskBody) {
    return this.tasks.create(body)
  }

  @HouseScope('CHAIRMAN', 'WORKER') @Get('tasks/:taskId')
  detail(@Param('taskId', ParseUUIDPipe) id: string) {
    return this.tasks.detail(id)
  }

  @HouseScope('CHAIRMAN') @Patch('tasks/:taskId')
  update(@Param('taskId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateTaskBody)) body: UpdateTaskBody) {
    return this.tasks.update(id, body)
  }

  @HouseScope('WORKER') @Post('tasks/:taskId/start') @HttpCode(200)
  start(@Param('taskId', ParseUUIDPipe) id: string) {
    return this.tasks.start(id)
  }

  @HouseScope('CHAIRMAN', 'WORKER') @Rate('upload') @Post('tasks/:taskId/complete') @HttpCode(200)
  complete(@Param('taskId', ParseUUIDPipe) id: string, @Body(new ZodPipe(completeTaskBody)) body: CompleteTaskBody) {
    return this.tasks.complete(id, body)
  }

  @HouseScope('CHAIRMAN') @Post('tasks/:taskId/approve') @HttpCode(200)
  approve(@Param('taskId', ParseUUIDPipe) id: string, @Body(new ZodPipe(approveTaskBody)) body: ApproveTaskBody) {
    return this.tasks.approve(id, body)
  }

  @HouseScope('CHAIRMAN') @Post('tasks/:taskId/reject') @HttpCode(200)
  reject(@Param('taskId', ParseUUIDPipe) id: string, @Body(new ZodPipe(rejectTaskBody)) body: z.infer<typeof rejectTaskBody>) {
    return this.tasks.reject(id, body.reason)
  }
}
