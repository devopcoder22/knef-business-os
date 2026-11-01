import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

import { AIProvidersService } from './ai-providers.service';
import { AIConversationsService } from './ai-conversations.service';
import { AIMemoryService } from './ai-memory.service';
import { AIKnowledgeService } from './ai-knowledge.service';
import { AIUsageService } from './ai-usage.service';

import {
  CreateAIProviderDto,
  UpdateAIProviderDto,
  CreateAIProviderRouteDto,
  UpdateAIProviderRouteDto,
  CreateConversationDto,
  SendMessageDto,
  ListConversationsDto,
  CreateMemoryDto,
  ListMemoriesDto,
  UploadDocumentDto,
  SearchKnowledgeDto,
  ListDocumentsDto,
  ListUsageLogsDto,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './dto/ai.dto';

// ── AI Providers Controller ───────────────────────────────────────

@ApiTags('ai-providers')
@ApiBearerAuth('JWT')
@Controller('ai/providers')
export class AIProvidersController {
  constructor(private readonly service: AIProvidersService) {}

  @Get()
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'List AI providers' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listProviders(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'Create AI provider' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAIProviderDto) {
    return this.service.createProvider(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'Get AI provider' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getProvider(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'Update AI provider' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAIProviderDto,
  ) {
    return this.service.updateProvider(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete AI provider' })
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.deleteProvider(user.organizationId, id);
  }

  @Post(':id/set-default')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set provider as default' })
  async setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.setDefault(user.organizationId, id);
    return { success: true };
  }

  @Post(':id/test')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test provider connectivity' })
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.testProvider(user.organizationId, id);
  }

  @Get(':id/routes')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'List provider routes' })
  listRoutes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listRoutes(user.organizationId, id);
  }

  @Post(':id/routes')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'Add routing rule' })
  createRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAIProviderRouteDto,
  ) {
    return this.service.createRoute(user.organizationId, id, dto);
  }

  @Patch(':id/routes/:routeId')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @ApiOperation({ summary: 'Update routing rule' })
  updateRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('routeId') routeId: string,
    @Body() dto: UpdateAIProviderRouteDto,
  ) {
    return this.service.updateRoute(user.organizationId, id, routeId, dto);
  }

  @Delete(':id/routes/:routeId')
  @Permissions(PERMISSIONS.AI.PROVIDERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete routing rule' })
  async deleteRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('routeId') routeId: string,
  ) {
    await this.service.deleteRoute(user.organizationId, id, routeId);
  }
}

// ── AI Conversations Controller ───────────────────────────────────

@ApiTags('ai-conversations')
@ApiBearerAuth('JWT')
@Controller('ai/conversations')
export class AIConversationsController {
  constructor(private readonly service: AIConversationsService) {}

  @Get()
  @Permissions(PERMISSIONS.AI.CHAT)
  @ApiOperation({ summary: 'List conversations' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListConversationsDto) {
    return this.service.listConversations(user.organizationId, user.id, {
      page: query.page,
      limit: query.limit,
      isArchived: query.isArchived,
    });
  }

  @Post()
  @Permissions(PERMISSIONS.AI.CHAT)
  @ApiOperation({ summary: 'Create conversation' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    return this.service.createConversation(user.organizationId, user.id, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AI.CHAT)
  @ApiOperation({ summary: 'Get conversation with messages' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getConversation(user.organizationId, user.id, id);
  }

  @Post(':id/messages')
  @Permissions(PERMISSIONS.AI.CHAT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send message and get AI reply' })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.sendMessage(user.organizationId, user.id, id, dto);
  }

  @Patch(':id/archive')
  @Permissions(PERMISSIONS.AI.CHAT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive conversation' })
  async archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.archiveConversation(user.organizationId, user.id, id);
    return { success: true };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.AI.CHAT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete conversation' })
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.deleteConversation(user.organizationId, user.id, id);
  }
}

// ── AI Memory Controller ─────────────────────────────────────────

@ApiTags('ai-memory')
@ApiBearerAuth('JWT')
@Controller('ai/memory')
export class AIMemoryController {
  constructor(private readonly service: AIMemoryService) {}

  @Get()
  @Permissions(PERMISSIONS.AI.MEMORY)
  @ApiOperation({ summary: 'List memories' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListMemoriesDto) {
    return this.service.listMemories(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.AI.MEMORY)
  @ApiOperation({ summary: 'Create or upsert memory' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMemoryDto) {
    return this.service.remember(user.organizationId, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.AI.MEMORY)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete memory' })
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.forget(user.organizationId, id);
  }
}

// ── AI Knowledge Controller ───────────────────────────────────────

@ApiTags('ai-knowledge')
@ApiBearerAuth('JWT')
@Controller('ai/knowledge')
export class AIKnowledgeController {
  constructor(private readonly service: AIKnowledgeService) {}

  @Get('documents')
  @Permissions(PERMISSIONS.AI.KNOWLEDGE)
  @ApiOperation({ summary: 'List documents' })
  listDocuments(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.service.listDocuments(user.organizationId, query);
  }

  @Post('documents')
  @Permissions(PERMISSIONS.AI.KNOWLEDGE)
  @ApiOperation({ summary: 'Upload document' })
  uploadDocument(@CurrentUser() user: AuthUser, @Body() dto: UploadDocumentDto) {
    return this.service.uploadDocument(user.organizationId, dto);
  }

  @Get('documents/:id')
  @Permissions(PERMISSIONS.AI.KNOWLEDGE)
  @ApiOperation({ summary: 'Get document' })
  getDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getDocument(user.organizationId, id);
  }

  @Delete('documents/:id')
  @Permissions(PERMISSIONS.AI.KNOWLEDGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete document' })
  async deleteDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.deleteDocument(user.organizationId, id);
  }

  @Post('search')
  @Permissions(PERMISSIONS.AI.KNOWLEDGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search knowledge base' })
  search(@CurrentUser() user: AuthUser, @Body() dto: SearchKnowledgeDto) {
    return this.service.search(user.organizationId, dto.query, dto.topK ?? 5);
  }
}

// ── AI Usage Controller ───────────────────────────────────────────

@ApiTags('ai-usage')
@ApiBearerAuth('JWT')
@Controller('ai/usage')
export class AIUsageController {
  constructor(private readonly service: AIUsageService) {}

  @Get('logs')
  @Permissions(PERMISSIONS.AI.USAGE)
  @ApiOperation({ summary: 'List usage logs' })
  listLogs(@CurrentUser() user: AuthUser, @Query() query: ListUsageLogsDto) {
    return this.service.listUsageLogs(user.organizationId, query);
  }

  @Get('summary')
  @Permissions(PERMISSIONS.AI.USAGE)
  @ApiOperation({ summary: 'Get usage summary' })
  getSummary(@CurrentUser() user: AuthUser) {
    return this.service.getUsageSummary(user.organizationId);
  }

  @Get('budgets')
  @Permissions(PERMISSIONS.AI.USAGE)
  @ApiOperation({ summary: 'List budgets' })
  listBudgets(@CurrentUser() user: AuthUser) {
    return this.service.listBudgets(user.organizationId);
  }

  @Post('budgets')
  @Permissions(PERMISSIONS.AI.USAGE)
  @ApiOperation({ summary: 'Create budget' })
  createBudget(@CurrentUser() user: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.service.createBudget(user.organizationId, dto);
  }

  @Patch('budgets/:id')
  @Permissions(PERMISSIONS.AI.USAGE)
  @ApiOperation({ summary: 'Update budget' })
  updateBudget(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.service.updateBudget(user.organizationId, id, dto);
  }
}
